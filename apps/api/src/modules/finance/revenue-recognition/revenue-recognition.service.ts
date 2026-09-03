import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { RevenueContract, RevenueContractStatus } from './entities/revenue-contract.entity';
import {
  PerformanceObligation,
  RecognitionMethod,
  ObligationStatus,
} from './entities/performance-obligation.entity';
import { RevenueSchedule } from './entities/revenue-schedule.entity';
import {
  CreateRevenueContractDto,
  CreateObligationDto,
  RecognizeDueDto,
} from './dto/revenue-recognition.dto';
import { GlService } from '../gl/gl.service';
import { Account } from '../gl/entities/account.entity';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RecognizeResult {
  recognizedCount: number;
  totalRecognized: number;
  journalEntryId: string | null;
}

export interface ContractSummary {
  contract: RevenueContract;
  obligations: Array<
    PerformanceObligation & { deferredAmount: number }
  >;
  schedules: RevenueSchedule[];
  totals: { allocated: number; recognized: number; deferred: number };
}

@Injectable()
export class RevenueRecognitionService {
  constructor(
    @InjectRepository(RevenueContract)
    private readonly contractRepo: Repository<RevenueContract>,
    @InjectRepository(PerformanceObligation)
    private readonly obligationRepo: Repository<PerformanceObligation>,
    @InjectRepository(RevenueSchedule)
    private readonly scheduleRepo: Repository<RevenueSchedule>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly glService: GlService,
  ) {}

  // ─── Number sequence ──────────────────────────────────────────────────────────

  private async nextContractNumber(tenantId: string): Promise<string> {
    const row = await this.contractRepo
      .createQueryBuilder('c')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(c.contract_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'mx',
      )
      .where('c.tenant_id = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `REV-${String(next).padStart(6, '0')}`;
  }

  // ─── Allocation ────────────────────────────────────────────────────────────────

  /**
   * Allocate the contract transaction price across obligations in proportion to
   * their standalone selling prices. Rounding residue lands on the last line so
   * the allocation always sums exactly to the transaction price.
   */
  allocateByRelativeSsp(
    obligations: Array<{ standaloneSellingPrice: number }>,
    totalPrice: number,
  ): number[] {
    const totalSsp = obligations.reduce((s, o) => s + Number(o.standaloneSellingPrice), 0);
    if (totalSsp <= 0) {
      throw new BadRequestException('Total standalone selling price must be greater than zero');
    }
    const allocations = obligations.map((o) =>
      round2((Number(o.standaloneSellingPrice) / totalSsp) * totalPrice),
    );
    const allocatedSoFar = round2(allocations.slice(0, -1).reduce((s, a) => s + a, 0));
    allocations[allocations.length - 1] = round2(totalPrice - allocatedSoFar);
    return allocations;
  }

  // ─── Schedule building ───────────────────────────────────────────────────────

  private lastDayOfMonth(year: number, month0: number): string {
    const d = new Date(year, month0 + 1, 0);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /**
   * Straight-line monthly schedule between two dates (inclusive of both end
   * months). The final period absorbs the rounding residue.
   */
  buildMonthlySchedule(
    startDate: string,
    endDate: string,
    amount: number,
  ): Array<{ periodEnd: string; amount: number }> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      throw new BadRequestException('endDate must not be before startDate');
    }
    const sy = start.getFullYear();
    const sm = start.getMonth();
    const months = (end.getFullYear() - sy) * 12 + (end.getMonth() - sm) + 1;
    const per = round2(amount / months);
    const rows: Array<{ periodEnd: string; amount: number }> = [];
    let running = 0;
    for (let i = 0; i < months; i++) {
      const isLast = i === months - 1;
      const amt = isLast ? round2(amount - running) : per;
      running = round2(running + amt);
      rows.push({ periodEnd: this.lastDayOfMonth(sy, sm + i), amount: amt });
    }
    return rows;
  }

  // ─── Contract creation ─────────────────────────────────────────────────────────

  async createContract(
    tenantId: string,
    dto: CreateRevenueContractDto,
  ): Promise<ContractSummary> {
    if (dto.totalTransactionPrice <= 0) {
      throw new BadRequestException('totalTransactionPrice must be greater than zero');
    }
    for (const ob of dto.obligations) {
      if (ob.method === RecognitionMethod.OVER_TIME && (!ob.startDate || !ob.endDate)) {
        throw new BadRequestException(
          `Obligation "${ob.name}" is OVER_TIME and requires startDate and endDate`,
        );
      }
    }

    const contractNumber =
      dto.contractNumber || (await this.nextContractNumber(tenantId));
    const existing = await this.contractRepo.findOne({
      where: { tenantId, contractNumber },
    });
    if (existing) {
      throw new BadRequestException(`Contract number ${contractNumber} already exists`);
    }

    const allocations = this.allocateByRelativeSsp(dto.obligations, dto.totalTransactionPrice);

    const contract = (await this.contractRepo.save(
      (this.contractRepo.create({
        tenantId,
        contractNumber,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName ?? null,
        contractDate: dto.contractDate,
        totalTransactionPrice: round2(dto.totalTransactionPrice),
        recognizedAmount: 0,
        currency: dto.currency || 'USD',
        status: RevenueContractStatus.ACTIVE,
        arInvoiceId: dto.arInvoiceId ?? null,
        notes: dto.notes ?? null,
      } as any) as unknown) as RevenueContract,
    )) as unknown as RevenueContract;

    for (let i = 0; i < dto.obligations.length; i++) {
      const ob = dto.obligations[i];
      const allocated = allocations[i];
      const obligation = (await this.obligationRepo.save(
        (this.obligationRepo.create({
          tenantId,
          contractId: contract.id,
          name: ob.name,
          description: ob.description ?? null,
          standaloneSellingPrice: round2(ob.standaloneSellingPrice),
          allocatedAmount: allocated,
          recognizedAmount: 0,
          method: ob.method,
          startDate: ob.startDate ?? null,
          endDate: ob.endDate ?? null,
          fulfilledDate: null,
          status: ObligationStatus.PENDING,
        } as any) as unknown) as PerformanceObligation,
      )) as unknown as PerformanceObligation;

      if (ob.method === RecognitionMethod.OVER_TIME) {
        const rows = this.buildMonthlySchedule(ob.startDate!, ob.endDate!, allocated);
        const scheduleEntities = rows.map(
          (r) =>
            (this.scheduleRepo.create({
              tenantId,
              contractId: contract.id,
              obligationId: obligation.id,
              periodEnd: r.periodEnd,
              scheduledAmount: r.amount,
              recognized: false,
            } as any) as unknown) as RevenueSchedule,
        );
        await this.scheduleRepo.save(scheduleEntities);
      }
      // POINT_IN_TIME: a schedule row is created at fulfilment time.
    }

    return this.getContractSummary(tenantId, contract.id);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────

  async listContracts(
    tenantId: string,
    filters: { status?: string; customerId?: string } = {},
  ): Promise<RevenueContract[]> {
    const qb = this.contractRepo
      .createQueryBuilder('c')
      .where('c.tenant_id = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('c.status = :status', { status: filters.status });
    if (filters.customerId) qb.andWhere('c.customer_id = :cid', { cid: filters.customerId });
    return qb.orderBy('c.contract_date', 'DESC').getMany();
  }

  async getContract(tenantId: string, id: string): Promise<RevenueContract> {
    const contract = await this.contractRepo.findOne({ where: { tenantId, id } });
    if (!contract) throw new NotFoundException(`Revenue contract ${id} not found`);
    return contract;
  }

  async getContractSummary(tenantId: string, id: string): Promise<ContractSummary> {
    const contract = await this.getContract(tenantId, id);
    const obligations = await this.obligationRepo.find({
      where: { tenantId, contractId: id },
      order: { createdAt: 'ASC' },
    });
    const schedules = await this.scheduleRepo.find({
      where: { tenantId, contractId: id },
      order: { periodEnd: 'ASC' },
    });

    const enriched = obligations.map((o) => ({
      ...o,
      deferredAmount: round2(Number(o.allocatedAmount) - Number(o.recognizedAmount)),
    }));
    const allocated = round2(obligations.reduce((s, o) => s + Number(o.allocatedAmount), 0));
    const recognized = round2(obligations.reduce((s, o) => s + Number(o.recognizedAmount), 0));

    return {
      contract,
      obligations: enriched as any,
      schedules,
      totals: { allocated, recognized, deferred: round2(allocated - recognized) },
    };
  }

  // ─── Fulfilment (POINT_IN_TIME) ────────────────────────────────────────────────

  async fulfillObligation(
    tenantId: string,
    obligationId: string,
    fulfilledDate?: string,
  ): Promise<PerformanceObligation> {
    const obligation = await this.obligationRepo.findOne({
      where: { tenantId, id: obligationId },
    });
    if (!obligation) throw new NotFoundException(`Obligation ${obligationId} not found`);
    if (obligation.method !== RecognitionMethod.POINT_IN_TIME) {
      throw new BadRequestException(
        'Only POINT_IN_TIME obligations are fulfilled directly; OVER_TIME obligations recognise on schedule',
      );
    }
    if (obligation.status === ObligationStatus.FULFILLED) {
      throw new BadRequestException('Obligation is already fulfilled');
    }

    const date = fulfilledDate || new Date().toISOString().slice(0, 10);
    obligation.fulfilledDate = date;
    obligation.status = ObligationStatus.FULFILLED;
    await this.obligationRepo.save(obligation);

    const remaining = round2(
      Number(obligation.allocatedAmount) - Number(obligation.recognizedAmount),
    );
    if (remaining > 0) {
      await this.scheduleRepo.save(
        (this.scheduleRepo.create({
          tenantId,
          contractId: obligation.contractId,
          obligationId: obligation.id,
          periodEnd: date,
          scheduledAmount: remaining,
          recognized: false,
        } as any) as unknown) as RevenueSchedule,
      );
    }
    return obligation;
  }

  // ─── Recognition ────────────────────────────────────────────────────────────────

  private async resolveAccount(
    tenantId: string,
    explicitId: string | undefined,
    fallbackCode: string,
  ): Promise<Account> {
    if (explicitId) return this.glService.findAccount(tenantId, explicitId);
    const account = await this.accountRepo.findOne({
      where: { tenantId, code: fallbackCode },
    });
    if (!account) {
      throw new BadRequestException(
        `Required account (code ${fallbackCode}) is missing from the chart of accounts`,
      );
    }
    return account;
  }

  /**
   * Recognise all due (unrecognised, periodEnd ≤ date) schedule rows, posting a
   * single journal entry: Dr deferred revenue, Cr sales revenue. Updates the
   * obligation and contract running totals and statuses.
   */
  async recognizeDue(
    tenantId: string,
    dto: RecognizeDueDto,
    userId: string,
  ): Promise<RecognizeResult> {
    const where: any = {
      tenantId,
      recognized: false,
      periodEnd: LessThanOrEqual(dto.periodEnd),
    };
    if (dto.contractId) where.contractId = dto.contractId;
    const due = await this.scheduleRepo.find({ where, order: { periodEnd: 'ASC' } });

    if (due.length === 0) {
      return { recognizedCount: 0, totalRecognized: 0, journalEntryId: null };
    }

    const deferred = await this.resolveAccount(
      tenantId,
      dto.deferredRevenueAccountId,
      DEFAULT_ACCOUNT_CODES.DEFERRED_REVENUE,
    );
    const revenue = await this.resolveAccount(
      tenantId,
      dto.revenueAccountId,
      DEFAULT_ACCOUNT_CODES.SALES_REVENUE,
    );

    const total = round2(due.reduce((s, r) => s + Number(r.scheduledAmount), 0));
    const currency = (await this.getContract(tenantId, due[0].contractId)).currency;

    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: dto.periodEnd,
        description: `Revenue recognition (${due.length} schedule${due.length === 1 ? '' : 's'})`,
        reference: dto.contractId ? `REVREC-${dto.contractId.slice(0, 8)}` : 'REVREC',
        source: JournalSource.SYSTEM,
        currency,
        lines: [
          { accountId: deferred.id, debit: total, credit: 0, description: 'Deferred revenue release' },
          { accountId: revenue.id, debit: 0, credit: total, description: 'Recognised revenue' },
        ],
      } as any,
      userId,
    );

    // Mark schedules recognised.
    for (const row of due) {
      row.recognized = true;
      row.recognizedDate = dto.periodEnd;
      row.journalEntryId = je.id;
    }
    await this.scheduleRepo.save(due);

    // Roll up per obligation, then per contract.
    const byObligation = new Map<string, number>();
    for (const row of due) {
      byObligation.set(
        row.obligationId,
        round2((byObligation.get(row.obligationId) ?? 0) + Number(row.scheduledAmount)),
      );
    }
    const obligations = await this.obligationRepo.find({
      where: { tenantId, id: In(Array.from(byObligation.keys())) },
    });
    const touchedContracts = new Set<string>();
    for (const ob of obligations) {
      ob.recognizedAmount = round2(
        Number(ob.recognizedAmount) + (byObligation.get(ob.id) ?? 0),
      );
      if (ob.recognizedAmount >= Number(ob.allocatedAmount) - 0.005) {
        ob.status = ObligationStatus.FULFILLED;
        if (!ob.fulfilledDate) ob.fulfilledDate = dto.periodEnd;
      } else {
        ob.status = ObligationStatus.IN_PROGRESS;
      }
      touchedContracts.add(ob.contractId);
    }
    await this.obligationRepo.save(obligations);

    for (const contractId of touchedContracts) {
      await this.refreshContractTotals(tenantId, contractId);
    }

    return { recognizedCount: due.length, totalRecognized: total, journalEntryId: je.id };
  }

  private async refreshContractTotals(tenantId: string, contractId: string): Promise<void> {
    const contract = await this.contractRepo.findOne({ where: { tenantId, id: contractId } });
    if (!contract) return;
    const obligations = await this.obligationRepo.find({
      where: { tenantId, contractId },
    });
    const recognized = round2(obligations.reduce((s, o) => s + Number(o.recognizedAmount), 0));
    contract.recognizedAmount = recognized;
    if (recognized >= Number(contract.totalTransactionPrice) - 0.005) {
      contract.status = RevenueContractStatus.COMPLETED;
    } else if (contract.status === RevenueContractStatus.DRAFT) {
      contract.status = RevenueContractStatus.ACTIVE;
    }
    await this.contractRepo.save(contract);
  }

  // ─── Reporting ──────────────────────────────────────────────────────────────────

  /** Deferred-revenue waterfall: scheduled (unrecognised) amounts grouped by period. */
  async getDeferredWaterfall(
    tenantId: string,
  ): Promise<{ rows: Array<{ periodEnd: string; scheduled: number }>; totalDeferred: number }> {
    const raw = await this.scheduleRepo
      .createQueryBuilder('s')
      .select('s.period_end', 'periodEnd')
      .addSelect('COALESCE(SUM(s.scheduled_amount), 0)', 'scheduled')
      .where('s.tenant_id = :tenantId', { tenantId })
      .andWhere('s.recognized = false')
      .groupBy('s.period_end')
      .orderBy('s.period_end', 'ASC')
      .getRawMany();
    const rows = raw.map((r) => ({
      periodEnd: r.periodEnd,
      scheduled: round2(Number(r.scheduled)),
    }));
    const totalDeferred = round2(rows.reduce((s, r) => s + r.scheduled, 0));
    return { rows, totalDeferred };
  }
}
