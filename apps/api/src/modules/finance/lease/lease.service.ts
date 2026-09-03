import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Lease, LeaseStatus, PaymentTiming } from './entities/lease.entity';
import { LeaseScheduleLine } from './entities/lease-schedule-line.entity';
import { CreateLeaseDto, PostLeasePeriodDto } from './dto/lease.dto';
import { GlService } from '../gl/gl.service';
import { Account } from '../gl/entities/account.entity';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ScheduleRow {
  periodNumber: number;
  periodEnd: string;
  openingLiability: number;
  payment: number;
  interest: number;
  principal: number;
  closingLiability: number;
  amortization: number;
}

export interface PostResult {
  postedCount: number;
  totalInterest: number;
  totalPrincipal: number;
  totalAmortization: number;
  journalEntryIds: string[];
}

export interface LeaseDetail {
  lease: Lease;
  schedule: LeaseScheduleLine[];
  netRouAsset: number;
}

@Injectable()
export class LeaseService {
  constructor(
    @InjectRepository(Lease)
    private readonly leaseRepo: Repository<Lease>,
    @InjectRepository(LeaseScheduleLine)
    private readonly lineRepo: Repository<LeaseScheduleLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly glService: GlService,
  ) {}

  // ─── Number sequence ──────────────────────────────────────────────────────────

  private async nextLeaseNumber(tenantId: string): Promise<string> {
    const row = await this.leaseRepo
      .createQueryBuilder('l')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(l.lease_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'mx',
      )
      .where('l.tenant_id = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `LSE-${String(next).padStart(6, '0')}`;
  }

  // ─── Measurement ────────────────────────────────────────────────────────────────

  /** Present value of a level annuity of `payment` over `n` periods at rate `r`. */
  presentValue(payment: number, ratePerPeriod: number, n: number, timing: PaymentTiming): number {
    if (n <= 0) return 0;
    if (ratePerPeriod === 0) return round2(payment * n);
    const ordinary = payment * (1 - Math.pow(1 + ratePerPeriod, -n)) / ratePerPeriod;
    const pv = timing === PaymentTiming.ADVANCE ? ordinary * (1 + ratePerPeriod) : ordinary;
    return round2(pv);
  }

  private addMonthsEndOfMonth(startDate: string, monthsFromStart: number): string {
    // periodEnd for period k (1-based) = last day of the month that is (k-1)
    // months after the start month.
    const start = new Date(startDate);
    const d = new Date(start.getFullYear(), start.getMonth() + monthsFromStart + 1, 0);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Build the full amortisation schedule: liability unwinding (interest +
   * principal) and straight-line ROU amortisation. The final period absorbs
   * rounding residue so the liability clears to exactly zero.
   */
  buildSchedule(opts: {
    startDate: string;
    termMonths: number;
    payment: number;
    annualRate: number;
    timing: PaymentTiming;
    rouAsset: number;
  }): ScheduleRow[] {
    const r = opts.annualRate / 100 / 12;
    const n = opts.termMonths;
    const pv = this.presentValue(opts.payment, r, n, opts.timing);

    const straightLine = round2(opts.rouAsset / n);
    const rows: ScheduleRow[] = [];
    let opening = pv;
    let amortRunning = 0;

    for (let k = 1; k <= n; k++) {
      const isLast = k === n;
      let interest: number;
      let principal: number;
      let closing: number;

      if (isLast) {
        // Plug the final period so the liability clears exactly.
        principal = round2(opening);
        interest = round2(opts.payment - principal);
        closing = 0;
      } else {
        const interestBase = opts.timing === PaymentTiming.ADVANCE ? opening - opts.payment : opening;
        interest = round2(interestBase * r);
        principal = round2(opts.payment - interest);
        closing = round2(opening - principal);
      }

      const amortization = isLast ? round2(opts.rouAsset - amortRunning) : straightLine;
      amortRunning = round2(amortRunning + amortization);

      rows.push({
        periodNumber: k,
        periodEnd: this.addMonthsEndOfMonth(opts.startDate, k - 1),
        openingLiability: round2(opening),
        payment: round2(opts.payment),
        interest,
        principal,
        closingLiability: closing,
        amortization,
      });
      opening = closing;
    }
    return rows;
  }

  // ─── Account resolution ───────────────────────────────────────────────────────

  private async resolveAccount(
    tenantId: string,
    explicitId: string | null | undefined,
    fallbackCode: string,
  ): Promise<Account> {
    if (explicitId) return this.glService.findAccount(tenantId, explicitId);
    const account = await this.accountRepo.findOne({ where: { tenantId, code: fallbackCode } });
    if (!account) {
      throw new BadRequestException(
        `Required account (code ${fallbackCode}) is missing from the chart of accounts`,
      );
    }
    return account;
  }

  // ─── Lease creation ──────────────────────────────────────────────────────────────

  async createLease(tenantId: string, dto: CreateLeaseDto, userId: string): Promise<LeaseDetail> {
    if (dto.paymentAmount <= 0) {
      throw new BadRequestException('paymentAmount must be greater than zero');
    }
    const timing = dto.paymentTiming ?? PaymentTiming.ARREARS;
    const r = dto.annualDiscountRate / 100 / 12;
    const pv = this.presentValue(dto.paymentAmount, r, dto.termMonths, timing);
    const idc = round2(dto.initialDirectCosts ?? 0);
    const rouAsset = round2(pv + idc);

    const leaseNumber = dto.leaseNumber || (await this.nextLeaseNumber(tenantId));
    const existing = await this.leaseRepo.findOne({ where: { tenantId, leaseNumber } });
    if (existing) {
      throw new BadRequestException(`Lease number ${leaseNumber} already exists`);
    }

    const lease = (await this.leaseRepo.save(
      (this.leaseRepo.create({
        tenantId,
        leaseNumber,
        lessorName: dto.lessorName ?? null,
        assetDescription: dto.assetDescription ?? null,
        currency: dto.currency || 'USD',
        startDate: dto.startDate,
        termMonths: dto.termMonths,
        paymentAmount: round2(dto.paymentAmount),
        paymentTiming: timing,
        annualDiscountRate: dto.annualDiscountRate,
        initialLiability: pv,
        rouAsset,
        initialDirectCosts: idc,
        liabilityBalance: pv,
        accumulatedAmortization: 0,
        status: LeaseStatus.ACTIVE,
        rouAssetAccountId: dto.rouAssetAccountId ?? null,
        accumAmortAccountId: dto.accumAmortAccountId ?? null,
        leaseLiabilityAccountId: dto.leaseLiabilityAccountId ?? null,
        interestExpenseAccountId: dto.interestExpenseAccountId ?? null,
        amortExpenseAccountId: dto.amortExpenseAccountId ?? null,
        bankAccountId: dto.bankAccountId ?? null,
        notes: dto.notes ?? null,
      } as any) as unknown) as Lease,
    )) as unknown as Lease;

    const rows = this.buildSchedule({
      startDate: dto.startDate,
      termMonths: dto.termMonths,
      payment: round2(dto.paymentAmount),
      annualRate: dto.annualDiscountRate,
      timing,
      rouAsset,
    });
    const lineEntities = rows.map(
      (row) =>
        (this.lineRepo.create({
          tenantId,
          leaseId: lease.id,
          periodNumber: row.periodNumber,
          periodEnd: row.periodEnd,
          openingLiability: row.openingLiability,
          payment: row.payment,
          interest: row.interest,
          principal: row.principal,
          closingLiability: row.closingLiability,
          amortization: row.amortization,
          posted: false,
        } as any) as unknown) as LeaseScheduleLine,
    );
    await this.lineRepo.save(lineEntities);

    // Initial recognition: Dr ROU asset, Cr lease liability (+ Cr bank for IDC).
    const rouAcct = await this.resolveAccount(tenantId, dto.rouAssetAccountId, DEFAULT_ACCOUNT_CODES.ROU_ASSET);
    const liabAcct = await this.resolveAccount(tenantId, dto.leaseLiabilityAccountId, DEFAULT_ACCOUNT_CODES.LEASE_LIABILITY);
    const lines: Array<{ accountId: string; debit: number; credit: number; description: string }> = [
      { accountId: rouAcct.id, debit: rouAsset, credit: 0, description: 'ROU asset recognition' },
      { accountId: liabAcct.id, debit: 0, credit: pv, description: 'Lease liability recognition' },
    ];
    if (idc > 0) {
      const bankAcct = await this.resolveAccount(tenantId, dto.bankAccountId, DEFAULT_ACCOUNT_CODES.BANK);
      lines.push({ accountId: bankAcct.id, debit: 0, credit: idc, description: 'Initial direct costs paid' });
    }
    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: dto.startDate,
        description: `Lease commencement ${leaseNumber}`,
        reference: leaseNumber,
        source: JournalSource.SYSTEM,
        currency: lease.currency,
        lines,
      } as any,
      userId,
    );
    lease.initialJournalEntryId = je.id;
    await this.leaseRepo.save(lease);

    return this.getLeaseDetail(tenantId, lease.id);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────

  async listLeases(tenantId: string, filters: { status?: string } = {}): Promise<Lease[]> {
    const qb = this.leaseRepo.createQueryBuilder('l').where('l.tenant_id = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    return qb.orderBy('l.start_date', 'DESC').getMany();
  }

  async getLease(tenantId: string, id: string): Promise<Lease> {
    const lease = await this.leaseRepo.findOne({ where: { tenantId, id } });
    if (!lease) throw new NotFoundException(`Lease ${id} not found`);
    return lease;
  }

  async getLeaseDetail(tenantId: string, id: string): Promise<LeaseDetail> {
    const lease = await this.getLease(tenantId, id);
    const schedule = await this.lineRepo.find({
      where: { tenantId, leaseId: id },
      order: { periodNumber: 'ASC' },
    });
    const netRouAsset = round2(Number(lease.rouAsset) - Number(lease.accumulatedAmortization));
    return { lease, schedule, netRouAsset };
  }

  // ─── Posting ──────────────────────────────────────────────────────────────────

  private async postLine(tenantId: string, lease: Lease, line: LeaseScheduleLine, userId: string): Promise<string> {
    const liabAcct = await this.resolveAccount(tenantId, lease.leaseLiabilityAccountId, DEFAULT_ACCOUNT_CODES.LEASE_LIABILITY);
    const interestAcct = await this.resolveAccount(tenantId, lease.interestExpenseAccountId, DEFAULT_ACCOUNT_CODES.INTEREST_EXPENSE);
    const bankAcct = await this.resolveAccount(tenantId, lease.bankAccountId, DEFAULT_ACCOUNT_CODES.BANK);
    const amortExpAcct = await this.resolveAccount(tenantId, lease.amortExpenseAccountId, DEFAULT_ACCOUNT_CODES.LEASE_AMORT_EXPENSE);
    const accumAcct = await this.resolveAccount(tenantId, lease.accumAmortAccountId, DEFAULT_ACCOUNT_CODES.ACCUM_AMORT_ROU);

    const principal = round2(Number(line.principal));
    const interest = round2(Number(line.interest));
    const payment = round2(Number(line.payment));
    const amort = round2(Number(line.amortization));

    const lines: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
    if (principal !== 0) lines.push({ accountId: liabAcct.id, debit: principal, credit: 0, description: 'Lease principal repayment' });
    if (interest !== 0) lines.push({ accountId: interestAcct.id, debit: interest, credit: 0, description: 'Lease interest expense' });
    if (payment !== 0) lines.push({ accountId: bankAcct.id, debit: 0, credit: payment, description: 'Lease payment' });
    if (amort !== 0) {
      lines.push({ accountId: amortExpAcct.id, debit: amort, credit: 0, description: 'ROU amortisation expense' });
      lines.push({ accountId: accumAcct.id, debit: 0, credit: amort, description: 'Accumulated ROU amortisation' });
    }

    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: line.periodEnd,
        description: `Lease ${lease.leaseNumber} period ${line.periodNumber}`,
        reference: `${lease.leaseNumber}-P${line.periodNumber}`,
        source: JournalSource.SYSTEM,
        currency: lease.currency,
        lines,
      } as any,
      userId,
    );

    line.posted = true;
    line.postedDate = line.periodEnd;
    line.journalEntryId = je.id;
    await this.lineRepo.save(line);

    return je.id;
  }

  /** Post every unposted schedule line dated on or before the period end. */
  async postDuePeriods(tenantId: string, dto: PostLeasePeriodDto, userId: string): Promise<PostResult> {
    const where: any = { tenantId, posted: false, periodEnd: LessThanOrEqual(dto.periodEnd) };
    if (dto.leaseId) where.leaseId = dto.leaseId;
    const due = await this.lineRepo.find({ where, order: { periodEnd: 'ASC' } });

    const result: PostResult = {
      postedCount: 0,
      totalInterest: 0,
      totalPrincipal: 0,
      totalAmortization: 0,
      journalEntryIds: [],
    };
    if (due.length === 0) return result;

    // Group by lease so we can update each lease's running balances once.
    const leaseCache = new Map<string, Lease>();
    for (const line of due) {
      let lease = leaseCache.get(line.leaseId);
      if (!lease) {
        lease = await this.getLease(tenantId, line.leaseId);
        leaseCache.set(line.leaseId, lease);
      }
      const jeId = await this.postLine(tenantId, lease, line, userId);
      result.journalEntryIds.push(jeId);
      result.postedCount += 1;
      result.totalInterest = round2(result.totalInterest + Number(line.interest));
      result.totalPrincipal = round2(result.totalPrincipal + Number(line.principal));
      result.totalAmortization = round2(result.totalAmortization + Number(line.amortization));
      lease.liabilityBalance = round2(Number(line.closingLiability));
      lease.accumulatedAmortization = round2(
        Number(lease.accumulatedAmortization) + Number(line.amortization),
      );
    }

    // Persist lease balances and close fully-amortised leases.
    for (const lease of leaseCache.values()) {
      const remaining = await this.lineRepo.count({
        where: { tenantId, leaseId: lease.id, posted: false },
      });
      if (remaining === 0) {
        lease.status = LeaseStatus.CLOSED;
        lease.liabilityBalance = 0;
      }
      await this.leaseRepo.save(lease);
    }

    return result;
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────────

  /** Maturity analysis of the remaining (unposted) liability, grouped by year. */
  async getMaturityAnalysis(
    tenantId: string,
  ): Promise<{
    rows: Array<{ year: string; principal: number; interest: number; payment: number }>;
    totalPrincipal: number;
    totalInterest: number;
  }> {
    const lines = await this.lineRepo.find({ where: { tenantId, posted: false } });
    const byYear = new Map<string, { principal: number; interest: number; payment: number }>();
    for (const l of lines) {
      const year = l.periodEnd.slice(0, 4);
      const acc = byYear.get(year) ?? { principal: 0, interest: 0, payment: 0 };
      acc.principal = round2(acc.principal + Number(l.principal));
      acc.interest = round2(acc.interest + Number(l.interest));
      acc.payment = round2(acc.payment + Number(l.payment));
      byYear.set(year, acc);
    }
    const rows = Array.from(byYear.entries())
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => a.year.localeCompare(b.year));
    return {
      rows,
      totalPrincipal: round2(rows.reduce((s, r) => s + r.principal, 0)),
      totalInterest: round2(rows.reduce((s, r) => s + r.interest, 0)),
    };
  }

  /** Portfolio totals across active leases for dashboard cards. */
  async getPortfolioSummary(
    tenantId: string,
  ): Promise<{
    leaseCount: number;
    grossRouAsset: number;
    accumulatedAmortization: number;
    netRouAsset: number;
    liabilityBalance: number;
  }> {
    const leases = await this.leaseRepo.find({
      where: [
        { tenantId, status: LeaseStatus.ACTIVE },
        { tenantId, status: LeaseStatus.CLOSED },
      ],
    });
    const grossRouAsset = round2(leases.reduce((s, l) => s + Number(l.rouAsset), 0));
    const accumulatedAmortization = round2(
      leases.reduce((s, l) => s + Number(l.accumulatedAmortization), 0),
    );
    const liabilityBalance = round2(leases.reduce((s, l) => s + Number(l.liabilityBalance), 0));
    return {
      leaseCount: leases.length,
      grossRouAsset,
      accumulatedAmortization,
      netRouAsset: round2(grossRouAsset - accumulatedAmortization),
      liabilityBalance,
    };
  }
}
