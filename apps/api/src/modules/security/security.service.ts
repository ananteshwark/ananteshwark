import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { MfaEnrollment, MfaMethod } from './entities/mfa-enrollment.entity';
import { IpAllowlistEntry } from './entities/ip-allowlist.entity';
import { UserSession, SessionStatus } from './entities/user-session.entity';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const FIELD_SECRET = process.env.FIELD_ENC_SECRET ?? 'dev-field-encryption-secret';

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) {
    const idx = BASE32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) { const o = Number(p); if (Number.isNaN(o) || o < 0 || o > 255) return null; n = (n << 8) | o; }
  return n >>> 0;
}

@Injectable()
export class SecurityService {
  constructor(
    @InjectRepository(MfaEnrollment) private readonly mfaRepo: Repository<MfaEnrollment>,
    @InjectRepository(IpAllowlistEntry) private readonly ipRepo: Repository<IpAllowlistEntry>,
    @InjectRepository(UserSession) private readonly sessionRepo: Repository<UserSession>,
  ) {}

  // ─── Ph-273: MFA (TOTP) ───────────────────────────────────────────

  totpCode(secret: string, timeMs: number, step = 30, digits = 6): string {
    const counter = Math.floor(timeMs / 1000 / step);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(bin % 10 ** digits).padStart(digits, '0');
  }

  verifyTotp(secret: string, code: string, timeMs: number, window = 1): boolean {
    for (let w = -window; w <= window; w++) {
      if (this.totpCode(secret, timeMs + w * 30_000) === code) return true;
    }
    return false;
  }

  async enrollTotp(tenantId: string, userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const secret = base32Encode(crypto.randomBytes(20));
    let row = await this.mfaRepo.findOne({ where: { tenantId, userId } });
    if (!row) row = this.mfaRepo.create({ tenantId, userId, method: MfaMethod.TOTP } as any) as unknown as MfaEnrollment;
    row.method = MfaMethod.TOTP; row.totpSecret = secret; row.verified = false; row.isActive = true;
    await this.mfaRepo.save(row);
    return { secret, otpauthUri: `otpauth://totp/ERP:${userId}?secret=${secret}&issuer=ERP` };
  }

  /** The enrollment that gates login: TOTP, verified by the user, active. */
  async getActiveTotpEnrollment(tenantId: string, userId: string): Promise<MfaEnrollment | null> {
    const row = await this.mfaRepo.findOne({ where: { tenantId, userId } });
    return row && row.method === MfaMethod.TOTP && row.verified && row.isActive && row.totpSecret
      ? row
      : null;
  }

  async verifyEnrollment(tenantId: string, userId: string, code: string, timeMs: number): Promise<{ verified: boolean }> {
    const row = await this.mfaRepo.findOne({ where: { tenantId, userId } });
    if (!row?.totpSecret) throw new NotFoundException('No MFA enrollment');
    const ok = this.verifyTotp(row.totpSecret, code, timeMs);
    if (ok) { row.verified = true; await this.mfaRepo.save(row); }
    return { verified: ok };
  }

  // ─── Ph-274: IP allowlisting ──────────────────────────────────────

  async addAllowlist(tenantId: string, data: { cidr: string; label?: string }): Promise<IpAllowlistEntry> {
    if (!data.cidr?.trim()) throw new BadRequestException('cidr is required');
    const e = this.ipRepo.create({ tenantId, cidr: data.cidr, label: data.label ?? null, isActive: true } as any) as unknown as IpAllowlistEntry;
    return (this.ipRepo.save(e) as unknown) as Promise<IpAllowlistEntry>;
  }

  listAllowlist(tenantId: string): Promise<IpAllowlistEntry[]> {
    return this.ipRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  private cidrMatch(ip: string, cidr: string): boolean {
    const [range, bitsStr] = cidr.split('/');
    const bits = bitsStr == null ? 32 : Number(bitsStr);
    const ipInt = ipToInt(ip), rangeInt = ipToInt(range);
    if (ipInt == null || rangeInt == null || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  }

  /** Check an IP against the tenant's allowlist. An empty allowlist allows all. */
  async isIpAllowed(tenantId: string, ip: string): Promise<{ allowed: boolean; matched: string | null }> {
    const entries = (await this.ipRepo.find({ where: { tenantId, isActive: true } }));
    if (entries.length === 0) return { allowed: true, matched: null };
    const hit = entries.find((e) => this.cidrMatch(ip, e.cidr));
    return { allowed: !!hit, matched: hit?.cidr ?? null };
  }

  // ─── Ph-275: session monitoring + anomaly detection ───────────────

  /**
   * Record a session, flagging anomalies: an unfamiliar IP (not among the
   * user's recent sessions) or an off-hours login (outside 06:00–22:00 UTC).
   */
  async recordSession(tenantId: string, data: { userId: string; ipAddress: string; userAgent?: string; at: string }): Promise<UserSession> {
    const prior = await this.sessionRepo.find({ where: { tenantId, userId: data.userId } });
    const knownIps = new Set(prior.map((s) => s.ipAddress));
    const flags: string[] = [];
    if (prior.length > 0 && !knownIps.has(data.ipAddress)) flags.push('NEW_IP');
    const hour = new Date(data.at).getUTCHours();
    if (hour < 6 || hour >= 22) flags.push('OFF_HOURS');
    const s = this.sessionRepo.create({
      tenantId, userId: data.userId, ipAddress: data.ipAddress, userAgent: data.userAgent ?? null,
      status: SessionStatus.ACTIVE, anomalyFlags: flags, startedAt: new Date(data.at), lastSeenAt: new Date(data.at),
    } as any) as unknown as UserSession;
    return (this.sessionRepo.save(s) as unknown) as Promise<UserSession>;
  }

  listSessions(tenantId: string, userId?: string): Promise<UserSession[]> {
    const where: any = { tenantId, status: SessionStatus.ACTIVE };
    if (userId) where.userId = userId;
    return this.sessionRepo.find({ where, order: { startedAt: 'DESC' } });
  }

  async revokeSession(tenantId: string, id: string): Promise<UserSession> {
    const s = await this.sessionRepo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException('Session not found');
    s.status = SessionStatus.REVOKED;
    return (this.sessionRepo.save(s) as unknown) as Promise<UserSession>;
  }

  // ─── Ph-276: field-level encryption ───────────────────────────────

  private tenantKey(tenantId: string): Buffer {
    return crypto.createHash('sha256').update(`${tenantId}:${FIELD_SECRET}`).digest();
  }

  /** Encrypt a PII field value with the per-tenant key (AES-256-CBC). */
  encryptField(tenantId: string, plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.tenantKey(tenantId), iv);
    const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${enc.toString('hex')}`;
  }

  decryptField(tenantId: string, token: string): string {
    const [ivHex, dataHex] = String(token).split(':');
    if (!ivHex || !dataHex) throw new BadRequestException('Invalid ciphertext');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.tenantKey(tenantId), Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
