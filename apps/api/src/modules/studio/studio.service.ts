import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey, ApiKeyStatus, LookupTable, LookupRow } from './entities/studio.entity';
import { AutomationService } from '../automation/automation.service';

const DAY_MS = 24 * 3600 * 1000;

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class StudioService {
  constructor(
    @InjectRepository(ApiKey) private readonly keyRepo: Repository<ApiKey>,
    @InjectRepository(LookupTable) private readonly tableRepo: Repository<LookupTable>,
    @InjectRepository(LookupRow) private readonly rowRepo: Repository<LookupRow>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── API keys ─────────────────────────────────────────────────

  /** Mint a key. Returns the plaintext once — it is never retrievable again. */
  async createKey(tenantId: string, dto: { name: string; scopes?: string[]; quotaPerDay?: number; alertThresholdPct?: number; expiresAt?: string; createdByUserId?: string }): Promise<{ apiKey: ApiKey; plaintext: string }> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const prefix = `sk_${crypto.randomBytes(5).toString('hex')}`; // 13 chars
    const secret = crypto.randomBytes(24).toString('hex');
    const plaintext = `${prefix}.${secret}`;
    const apiKey = await this.keyRepo.save(this.keyRepo.create({
      tenantId, name: dto.name.trim(), prefix, hashedKey: hashKey(plaintext),
      scopes: dto.scopes ?? [], status: ApiKeyStatus.ACTIVE,
      quotaPerDay: dto.quotaPerDay ?? null, alertThresholdPct: dto.alertThresholdPct ?? 80,
      expiresAt: dto.expiresAt ?? null, createdByUserId: dto.createdByUserId ?? null,
    }));
    return { apiKey, plaintext };
  }

  listKeys(tenantId: string): Promise<ApiKey[]> {
    return this.keyRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async revokeKey(tenantId: string, id: string): Promise<ApiKey> {
    const key = await this.keyRepo.findOne({ where: { id, tenantId } });
    if (!key) throw new NotFoundException(`API key ${id} not found`);
    key.status = ApiKeyStatus.REVOKED;
    return this.keyRepo.save(key);
  }

  async setScopes(tenantId: string, id: string, scopes: string[]): Promise<ApiKey> {
    const key = await this.keyRepo.findOne({ where: { id, tenantId } });
    if (!key) throw new NotFoundException(`API key ${id} not found`);
    key.scopes = scopes ?? [];
    return this.keyRepo.save(key);
  }

  /** Resolve a raw key to its record, validating status and expiry. */
  async resolveKey(rawKey: string, asOf: string): Promise<ApiKey> {
    const prefix = (rawKey ?? '').split('.')[0];
    if (!prefix) throw new ForbiddenException('Malformed API key');
    const key = await this.keyRepo.findOne({ where: { prefix } });
    if (!key || key.hashedKey !== hashKey(rawKey)) throw new ForbiddenException('Invalid API key');
    if (key.status !== ApiKeyStatus.ACTIVE) throw new ForbiddenException('API key is revoked');
    if (key.expiresAt && key.expiresAt < asOf) throw new ForbiddenException('API key has expired');
    return key;
  }

  /**
   * Authorize a programmatic call: resolve the key, enforce the required scope,
   * and consume one unit of quota. Returns the key plus remaining quota and an
   * alert flag. This is the gateway all Studio APIs (incl. reports) pass through.
   */
  async authorize(rawKey: string, requiredScope: string, nowMs: number): Promise<{ key: ApiKey; remaining: number | null; alert: boolean }> {
    const asOf = new Date(nowMs).toISOString().slice(0, 10);
    const key = await this.resolveKey(rawKey, asOf);
    if (requiredScope && !this.hasScope(key, requiredScope)) {
      throw new ForbiddenException(`API key is missing the required scope "${requiredScope}"`);
    }
    // Roll the usage window if the previous one has elapsed.
    const windowStart = key.usageWindowStart ? key.usageWindowStart.getTime() : 0;
    if (!windowStart || nowMs - windowStart >= DAY_MS) {
      key.usageWindowStart = new Date(nowMs);
      key.usageCount = 0;
      key.alertSent = false;
    }
    if (key.quotaPerDay != null && key.usageCount >= key.quotaPerDay) {
      await this.keyRepo.save(key);
      throw new ForbiddenException('API key daily quota exceeded');
    }
    key.usageCount += 1;
    key.lastUsedAt = new Date(nowMs);

    let alert = false;
    if (key.quotaPerDay != null) {
      const usedPct = (key.usageCount / key.quotaPerDay) * 100;
      if (!key.alertSent && usedPct >= key.alertThresholdPct) {
        alert = true;
        key.alertSent = true;
        await this.automation?.emit(key.tenantId, 'apikey.quota_alert', {
          keyId: key.id, name: key.name, usedPct: Math.round(usedPct), quotaPerDay: key.quotaPerDay,
        });
      }
    }
    const saved = await this.keyRepo.save(key);
    return { key: saved, remaining: key.quotaPerDay != null ? Math.max(0, key.quotaPerDay - saved.usageCount) : null, alert };
  }

  hasScope(key: ApiKey, scope: string): boolean {
    return key.scopes.includes('*') || key.scopes.includes(scope);
  }

  // ─── Lookup tables ────────────────────────────────────────────

  async createTable(tenantId: string, dto: { key: string; name: string; description?: string; columns: Array<{ key: string; label?: string; type?: string }> }): Promise<LookupTable> {
    if (!dto.key?.trim() || !dto.name?.trim()) throw new BadRequestException('key and name are required');
    if (!dto.columns?.length) throw new BadRequestException('At least one column is required');
    const existing = await this.tableRepo.findOne({ where: { tenantId, key: dto.key.trim() } });
    if (existing) throw new BadRequestException(`Lookup table "${dto.key}" already exists`);
    return this.tableRepo.save(this.tableRepo.create({
      tenantId, key: dto.key.trim(), name: dto.name.trim(), description: dto.description ?? null,
      columns: dto.columns.filter((c) => c.key?.trim()),
    }));
  }

  listTables(tenantId: string): Promise<LookupTable[]> {
    return this.tableRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async getTable(tenantId: string, key: string): Promise<LookupTable> {
    const table = await this.tableRepo.findOne({ where: { tenantId, key } });
    if (!table) throw new NotFoundException(`Lookup table "${key}" not found`);
    return table;
  }

  /** Upsert a row keyed by the table's first column. */
  async upsertRow(tenantId: string, tableKey: string, values: Record<string, any>): Promise<LookupRow> {
    const table = await this.getTable(tenantId, tableKey);
    const keyCol = table.columns[0]?.key;
    const lookupKey = keyCol ? String(values?.[keyCol] ?? '') : '';
    if (!lookupKey) throw new BadRequestException(`A value for the key column "${keyCol}" is required`);
    let row = await this.rowRepo.findOne({ where: { tenantId, tableId: table.id, lookupKey } });
    if (!row) row = this.rowRepo.create({ tenantId, tableId: table.id, lookupKey });
    row.values = values ?? {};
    return this.rowRepo.save(row);
  }

  listRows(tenantId: string, tableKey: string): Promise<LookupRow[]> {
    return this.getTable(tenantId, tableKey).then((t) => this.rowRepo.find({ where: { tenantId, tableId: t.id }, order: { lookupKey: 'ASC' } }));
  }

  /** Resolve a single lookup value by key (the reference-data read path). */
  async lookup(tenantId: string, tableKey: string, lookupKey: string): Promise<Record<string, any> | null> {
    const table = await this.getTable(tenantId, tableKey);
    const row = await this.rowRepo.findOne({ where: { tenantId, tableId: table.id, lookupKey } });
    return row?.values ?? null;
  }

  async deleteRow(tenantId: string, tableKey: string, lookupKey: string): Promise<{ deleted: boolean }> {
    const table = await this.getTable(tenantId, tableKey);
    const row = await this.rowRepo.findOne({ where: { tenantId, tableId: table.id, lookupKey } });
    if (!row) throw new NotFoundException(`Row "${lookupKey}" not found`);
    await this.rowRepo.remove(row);
    return { deleted: true };
  }
}
