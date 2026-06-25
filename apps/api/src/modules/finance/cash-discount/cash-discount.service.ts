import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentTerm, CashDiscountTier } from './entities/payment-term.entity';
import { CashDiscount, CashDiscountType } from './entities/cash-discount.entity';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
} from './dto/cash-discount.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface DiscountComputation {
  applicable: boolean;
  termCode: string;
  baseAmount: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
  daysTaken: number;
  /** the tier that matched, if any */
  tier: CashDiscountTier | null;
  netDueDate: string;
}

export interface RecordDiscountInput {
  type: CashDiscountType;
  partyId: string;
  partyName: string;
  documentId?: string | null;
  documentNumber?: string | null;
  termCode?: string | null;
  baseAmount: number;
  discountPercent: number;
  discountAmount: number;
  documentDate?: string | null;
  paymentDate: string;
  daysTaken?: number | null;
  currency?: string;
  journalEntryId?: string | null;
}

@Injectable()
export class CashDiscountService {
  constructor(
    @InjectRepository(PaymentTerm)
    private readonly termRepo: Repository<PaymentTerm>,
    @InjectRepository(CashDiscount)
    private readonly discountRepo: Repository<CashDiscount>,
  ) {}

  // ─── Payment Term CRUD ────────────────────────────────────────────────────────

  async createPaymentTerm(tenantId: string, dto: CreatePaymentTermDto): Promise<PaymentTerm> {
    const existing = await this.termRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Payment term ${dto.code} already exists`);
    const tiers = this.normalizeTiers(dto.tiers ?? []);
    const term = this.termRepo.create({
      tenantId,
      code: dto.code,
      name: dto.name,
      netDays: dto.netDays,
      tiers,
      description: dto.description ?? null,
      isActive: true,
    } as any);
    return (this.termRepo.save(term) as unknown) as Promise<PaymentTerm>;
  }

  async updatePaymentTerm(tenantId: string, id: string, dto: UpdatePaymentTermDto): Promise<PaymentTerm> {
    const term = await this.termRepo.findOne({ where: { id, tenantId } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    if (dto.name !== undefined) term.name = dto.name;
    if (dto.netDays !== undefined) term.netDays = dto.netDays;
    if (dto.tiers !== undefined) term.tiers = this.normalizeTiers(dto.tiers);
    if (dto.description !== undefined) term.description = dto.description;
    if (dto.isActive !== undefined) term.isActive = dto.isActive;
    return (this.termRepo.save(term) as unknown) as Promise<PaymentTerm>;
  }

  async findPaymentTerms(tenantId: string, activeOnly = false): Promise<PaymentTerm[]> {
    const where: any = { tenantId };
    if (activeOnly) where.isActive = true;
    return this.termRepo.find({ where, order: { code: 'ASC' } });
  }

  async findPaymentTerm(tenantId: string, id: string): Promise<PaymentTerm> {
    const term = await this.termRepo.findOne({ where: { id, tenantId } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    return term;
  }

  async findByCode(tenantId: string, code: string): Promise<PaymentTerm | null> {
    if (!code) return null;
    return this.termRepo.findOne({ where: { tenantId, code } });
  }

  async deletePaymentTerm(tenantId: string, id: string): Promise<void> {
    const term = await this.termRepo.findOne({ where: { id, tenantId } });
    if (!term) throw new NotFoundException(`Payment term ${id} not found`);
    await this.termRepo.remove(term);
  }

  /** Idempotently seed common SAP-style payment terms */
  async seedDefaults(tenantId: string): Promise<PaymentTerm[]> {
    const defaults: CreatePaymentTermDto[] = [
      { code: 'NET30', name: 'Net 30 days', netDays: 30, tiers: [] },
      { code: '2/10NET30', name: '2% 10 days, net 30', netDays: 30, tiers: [{ discountPercent: 2, withinDays: 10 }] },
      {
        code: '2/10-1/20NET30',
        name: '2% 10d, 1% 20d, net 30',
        netDays: 30,
        tiers: [
          { discountPercent: 2, withinDays: 10 },
          { discountPercent: 1, withinDays: 20 },
        ],
      },
      { code: 'NET15', name: 'Net 15 days', netDays: 15, tiers: [] },
    ];
    const created: PaymentTerm[] = [];
    for (const d of defaults) {
      const existing = await this.termRepo.findOne({ where: { tenantId, code: d.code } });
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(await this.createPaymentTerm(tenantId, d));
    }
    return created;
  }

  // ─── Discount Computation ─────────────────────────────────────────────────────

  /** Tiers normalised: dedup-safe, sorted best (highest %) first */
  private normalizeTiers(tiers: CashDiscountTier[]): CashDiscountTier[] {
    return [...tiers]
      .map(t => ({ discountPercent: Number(t.discountPercent), withinDays: Number(t.withinDays) }))
      .sort((a, b) => b.discountPercent - a.discountPercent);
  }

  private daysBetween(from: string, to: string): number {
    const a = new Date(from + 'T00:00:00Z').getTime();
    const b = new Date(to + 'T00:00:00Z').getTime();
    return Math.round((b - a) / 86_400_000);
  }

  private addDays(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Given a term, base amount, baseline (invoice/bill) date and payment date,
   * determine the best applicable cash-discount tier. Picks the tier with the
   * highest discount % whose window still covers the payment date.
   */
  computeForTerm(
    term: PaymentTerm,
    baseAmount: number,
    baselineDate: string,
    paymentDate: string,
  ): DiscountComputation {
    const days = this.daysBetween(baselineDate, paymentDate);
    const netDueDate = this.addDays(baselineDate, term.netDays);
    // sorted best-first; the first tier whose window covers payment wins
    const tiers = this.normalizeTiers(term.tiers ?? []);
    const match = tiers.find(t => days <= t.withinDays && days >= 0) ?? null;
    const discountPercent = match ? match.discountPercent : 0;
    const discountAmount = round2((baseAmount * discountPercent) / 100);
    return {
      applicable: !!match && discountAmount > 0,
      termCode: term.code,
      baseAmount: round2(baseAmount),
      discountPercent,
      discountAmount,
      netAmount: round2(baseAmount - discountAmount),
      daysTaken: days,
      tier: match,
      netDueDate,
    };
  }

  async computeByCode(
    tenantId: string,
    termCode: string,
    baseAmount: number,
    baselineDate: string,
    paymentDate: string,
  ): Promise<DiscountComputation> {
    const term = await this.findByCode(tenantId, termCode);
    if (!term) throw new NotFoundException(`Payment term ${termCode} not found`);
    if (baseAmount < 0) throw new BadRequestException('baseAmount must be non-negative');
    return this.computeForTerm(term, baseAmount, baselineDate, paymentDate);
  }

  // ─── Realised Discount Logging ────────────────────────────────────────────────

  async recordDiscount(tenantId: string, input: RecordDiscountInput): Promise<CashDiscount> {
    const rec = this.discountRepo.create({
      tenantId,
      type: input.type,
      partyId: input.partyId,
      partyName: input.partyName,
      documentId: input.documentId ?? null,
      documentNumber: input.documentNumber ?? null,
      termCode: input.termCode ?? null,
      baseAmount: round2(input.baseAmount),
      discountPercent: input.discountPercent,
      discountAmount: round2(input.discountAmount),
      documentDate: input.documentDate ?? null,
      paymentDate: input.paymentDate,
      daysTaken: input.daysTaken ?? null,
      currency: input.currency ?? 'USD',
      journalEntryId: input.journalEntryId ?? null,
    } as any);
    return (this.discountRepo.save(rec) as unknown) as Promise<CashDiscount>;
  }

  // ─── Utilisation Report ───────────────────────────────────────────────────────

  async getUtilizationReport(
    tenantId: string,
    filters: { type?: CashDiscountType; from?: string; to?: string },
  ): Promise<{
    rows: Array<{
      partyId: string;
      partyName: string;
      type: CashDiscountType;
      discountCount: number;
      totalBase: number;
      totalDiscount: number;
      avgPercent: number;
    }>;
    totals: { totalBase: number; totalDiscount: number; discountCount: number };
  }> {
    const qb = this.discountRepo
      .createQueryBuilder('cd')
      .where('cd.tenant_id = :tenantId', { tenantId });
    if (filters.type) qb.andWhere('cd.type = :type', { type: filters.type });
    if (filters.from) qb.andWhere('cd.payment_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('cd.payment_date <= :to', { to: filters.to });
    const records = await qb.getMany();

    const byParty = new Map<
      string,
      {
        partyId: string;
        partyName: string;
        type: CashDiscountType;
        discountCount: number;
        totalBase: number;
        totalDiscount: number;
      }
    >();
    for (const r of records) {
      const key = `${r.type}:${r.partyId}`;
      const cur =
        byParty.get(key) ??
        {
          partyId: r.partyId,
          partyName: r.partyName,
          type: r.type,
          discountCount: 0,
          totalBase: 0,
          totalDiscount: 0,
        };
      cur.discountCount += 1;
      cur.totalBase = round2(cur.totalBase + Number(r.baseAmount));
      cur.totalDiscount = round2(cur.totalDiscount + Number(r.discountAmount));
      byParty.set(key, cur);
    }

    const rows = [...byParty.values()]
      .map(r => ({
        ...r,
        avgPercent: r.totalBase > 0 ? round2((r.totalDiscount / r.totalBase) * 100) : 0,
      }))
      .sort((a, b) => b.totalDiscount - a.totalDiscount);

    const totals = rows.reduce(
      (acc, r) => ({
        totalBase: round2(acc.totalBase + r.totalBase),
        totalDiscount: round2(acc.totalDiscount + r.totalDiscount),
        discountCount: acc.discountCount + r.discountCount,
      }),
      { totalBase: 0, totalDiscount: 0, discountCount: 0 },
    );

    return { rows, totals };
  }

  async listDiscounts(
    tenantId: string,
    filters: { type?: CashDiscountType; partyId?: string; from?: string; to?: string },
  ): Promise<CashDiscount[]> {
    const qb = this.discountRepo
      .createQueryBuilder('cd')
      .where('cd.tenant_id = :tenantId', { tenantId });
    if (filters.type) qb.andWhere('cd.type = :type', { type: filters.type });
    if (filters.partyId) qb.andWhere('cd.party_id = :partyId', { partyId: filters.partyId });
    if (filters.from) qb.andWhere('cd.payment_date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('cd.payment_date <= :to', { to: filters.to });
    return qb.orderBy('cd.payment_date', 'DESC').getMany();
  }
}
