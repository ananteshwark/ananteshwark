import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PiiField, MaskStrategy } from './entities/pii-field.entity';
import { Consent } from './entities/consent.entity';
import { ErasureRequest, ErasureStatus } from './entities/erasure-request.entity';
import { DsarRequest } from './entities/dsar-request.entity';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectRepository(PiiField) private readonly piiRepo: Repository<PiiField>,
    @InjectRepository(Consent) private readonly consentRepo: Repository<Consent>,
    @InjectRepository(ErasureRequest) private readonly erasureRepo: Repository<ErasureRequest>,
    @InjectRepository(DsarRequest) private readonly dsarRepo: Repository<DsarRequest>,
  ) {}

  // ─── Ph-269: personal data inventory ──────────────────────────────

  async registerPiiField(tenantId: string, data: { entityName: string; fieldName: string; category: string; sensitivity?: string; maskStrategy?: MaskStrategy }): Promise<PiiField> {
    if (!data.entityName || !data.fieldName || !data.category) throw new BadRequestException('entityName, fieldName, and category are required');
    let row = await this.piiRepo.findOne({ where: { tenantId, entityName: data.entityName, fieldName: data.fieldName } });
    if (row) { row.category = data.category; row.sensitivity = data.sensitivity ?? row.sensitivity; row.maskStrategy = data.maskStrategy ?? row.maskStrategy; }
    else row = this.piiRepo.create({ tenantId, entityName: data.entityName, fieldName: data.fieldName, category: data.category, sensitivity: data.sensitivity ?? 'MEDIUM', maskStrategy: data.maskStrategy ?? MaskStrategy.FULL } as any) as unknown as PiiField;
    return (this.piiRepo.save(row) as unknown) as Promise<PiiField>;
  }

  listPiiFields(tenantId: string, entityName?: string): Promise<PiiField[]> {
    const where: any = { tenantId };
    if (entityName) where.entityName = entityName;
    return this.piiRepo.find({ where, order: { entityName: 'ASC' } });
  }

  /** Mask a value per a strategy (pure, reused by DSAR/erasure previews). */
  mask(value: string, strategy: MaskStrategy): string {
    const v = String(value ?? '');
    if (!v) return v;
    switch (strategy) {
      case MaskStrategy.PARTIAL: return v.length <= 4 ? '*'.repeat(v.length) : '*'.repeat(v.length - 4) + v.slice(-4);
      case MaskStrategy.EMAIL: {
        const [local, domain] = v.split('@');
        if (!domain) return '*'.repeat(v.length);
        return `${local[0] ?? '*'}***@${domain}`;
      }
      case MaskStrategy.HASH: {
        let h = 0; for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
        return `#${h.toString(16)}`;
      }
      case MaskStrategy.FULL:
      default: return '*'.repeat(Math.min(v.length, 8));
    }
  }

  // ─── Ph-270: consent management ───────────────────────────────────

  async recordConsent(tenantId: string, data: { subjectId: string; subjectType?: string; purpose: string; granted: boolean; at: string }): Promise<Consent> {
    if (!data.subjectId || !data.purpose) throw new BadRequestException('subjectId and purpose are required');
    let row = await this.consentRepo.findOne({ where: { tenantId, subjectId: data.subjectId, purpose: data.purpose } });
    if (!row) row = this.consentRepo.create({ tenantId, subjectId: data.subjectId, subjectType: data.subjectType ?? 'CUSTOMER', purpose: data.purpose } as any) as unknown as Consent;
    row.granted = data.granted;
    if (data.granted) { row.grantedAt = new Date(data.at); row.withdrawnAt = null; }
    else row.withdrawnAt = new Date(data.at);
    return (this.consentRepo.save(row) as unknown) as Promise<Consent>;
  }

  async hasConsent(tenantId: string, subjectId: string, purpose: string): Promise<{ granted: boolean }> {
    const row = await this.consentRepo.findOne({ where: { tenantId, subjectId, purpose } });
    return { granted: !!row?.granted };
  }

  listConsents(tenantId: string, subjectId: string): Promise<Consent[]> {
    return this.consentRepo.find({ where: { tenantId, subjectId } });
  }

  // ─── Ph-271: right to erasure ─────────────────────────────────────

  async requestErasure(tenantId: string, data: { subjectId: string; subjectType?: string; retentionUntil: string; reason?: string }): Promise<ErasureRequest> {
    if (!data.subjectId || !data.retentionUntil) throw new BadRequestException('subjectId and retentionUntil are required');
    const r = this.erasureRepo.create({
      tenantId, subjectId: data.subjectId, subjectType: data.subjectType ?? 'CUSTOMER',
      retentionUntil: data.retentionUntil, status: ErasureStatus.PENDING, anonymizedAt: null, reason: data.reason ?? null,
    } as any) as unknown as ErasureRequest;
    return (this.erasureRepo.save(r) as unknown) as Promise<ErasureRequest>;
  }

  /** Anonymize erasure requests whose retention period has lapsed as of `asOf`. */
  async processErasures(tenantId: string, asOf: string): Promise<any> {
    const pending = await this.erasureRepo.find({ where: { tenantId, status: ErasureStatus.PENDING } });
    const due = pending.filter((r) => r.retentionUntil <= asOf);
    for (const r of due) { r.status = ErasureStatus.ANONYMIZED; r.anonymizedAt = new Date(asOf); await this.erasureRepo.save(r); }
    return { anonymized: due.length, retained: pending.length - due.length, subjects: due.map((r) => r.subjectId) };
  }

  // ─── Ph-272: DSAR ─────────────────────────────────────────────────

  /**
   * Fulfil a DSAR: persist an export of all personal data supplied for the
   * subject and open an access audit trail.
   */
  async fulfilDsar(tenantId: string, requestedBy: string, data: { subjectId: string; data: any; at: string }): Promise<DsarRequest> {
    if (!data.subjectId) throw new BadRequestException('subjectId is required');
    const consents = await this.consentRepo.find({ where: { tenantId, subjectId: data.subjectId } });
    const exported = { subjectId: data.subjectId, records: data.data ?? {}, consents: consents.map((c) => ({ purpose: c.purpose, granted: c.granted })) };
    const dsar = this.dsarRepo.create({
      tenantId, subjectId: data.subjectId, status: 'COMPLETED', exportedData: exported, requestedBy,
      accessLog: [{ userId: requestedBy, at: data.at, action: 'EXPORT_CREATED' }],
    } as any) as unknown as DsarRequest;
    return (this.dsarRepo.save(dsar) as unknown) as Promise<DsarRequest>;
  }

  async accessDsar(tenantId: string, id: string, userId: string, at: string): Promise<DsarRequest> {
    const dsar = await this.dsarRepo.findOne({ where: { id, tenantId } });
    if (!dsar) throw new NotFoundException('DSAR not found');
    dsar.accessLog = [...(dsar.accessLog ?? []), { userId, at, action: 'ACCESSED' }];
    return (this.dsarRepo.save(dsar) as unknown) as Promise<DsarRequest>;
  }
}
