import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BudgetLine } from './entities/budget-line.entity';
import { Account } from '../gl/entities/account.entity';
import { CostCenter } from '../gl/entities/cost-center.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { PurchaseOrder, PoStatus } from '../../procurement/po/entities/purchase-order.entity';
import { PoLine } from '../../procurement/po/entities/po-line.entity';
import {
  CreateBudgetLineDto,
  UpdateBudgetLineDto,
  CheckBudgetDto,
} from './dto/budget.dto';

export interface BudgetVsActualFilters {
  fiscalYear: number;
  period?: string | null;
  costCenterId?: string | null;
}

export interface BudgetVsActualRow {
  glAccountId: string | null;
  accountCode: string | null;
  accountName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  budget: number;
  committed: number;
  actual: number;
  available: number;
  variance: number;
  utilization: number;
}

export type BudgetCheckStatus = 'OK' | 'WARNING' | 'EXCEEDED';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** PO statuses that still represent an open commitment (goods/invoice not fully done). */
const OPEN_PO_STATUSES: PoStatus[] = [
  PoStatus.DRAFT,
  PoStatus.PENDING_APPROVAL,
  PoStatus.APPROVED,
  PoStatus.RELEASED,
  PoStatus.SENT,
  PoStatus.PARTIALLY_RECEIVED,
];

@Injectable()
export class BudgetService {
  constructor(
    @InjectRepository(BudgetLine)
    private readonly lineRepo: Repository<BudgetLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(JournalLine)
    private readonly journalLineRepo: Repository<JournalLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PoLine)
    private readonly poLineRepo: Repository<PoLine>,
  ) {}

  // ─── Date helpers ──────────────────────────────────────────────────────────

  /** Resolve [fromDate, toDate] (inclusive) for a fiscal year + optional period. */
  private dateRange(fiscalYear: number, period?: string | null): { from: string; to: string } {
    if (period) {
      const [y, m] = period.split('-').map((p) => parseInt(p, 10));
      const from = `${y}-${String(m).padStart(2, '0')}-01`;
      const last = new Date(y, m, 0).getDate();
      const to = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
      return { from, to };
    }
    return { from: `${fiscalYear}-01-01`, to: `${fiscalYear}-12-31` };
  }

  // ─── Actuals & commitments ─────────────────────────────────────────────────

  /** Posted GL net (debit-credit) grouped by account, optionally filtered by cost center. */
  private async actualsByAccount(
    tenantId: string,
    from: string,
    to: string,
    costCenterId?: string | null,
  ): Promise<Map<string, number>> {
    const qb = this.journalLineRepo
      .createQueryBuilder('l')
      .innerJoin('fin_journal_entries', 'je', 'je.id = l.journal_entry_id')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('je.date >= :from', { from })
      .andWhere('je.date <= :to', { to })
      .andWhere('je.status = :posted', { posted: 'POSTED' })
      .select('l.account_id', 'accountId')
      .addSelect('COALESCE(SUM(l.debit - l.credit), 0)', 'net')
      .groupBy('l.account_id');
    if (costCenterId) qb.andWhere('l.cost_center_id = :costCenterId', { costCenterId });
    const rows = await qb.getRawMany<{ accountId: string; net: string }>();
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.accountId) map.set(r.accountId, round2(parseFloat(r.net) || 0));
    }
    return map;
  }

  /**
   * Open-PO commitment grouped by account.
   * Commitment per line = remaining (open) portion = lineTotal * (1 - qtyReceived/qty).
   */
  private async commitmentsByAccount(
    tenantId: string,
    fiscalYear: number,
    period?: string | null,
  ): Promise<Map<string, number>> {
    const { from, to } = this.dateRange(fiscalYear, period);
    const qb = this.poLineRepo
      .createQueryBuilder('pl')
      .innerJoin(PurchaseOrder, 'po', 'po.id = pl.po_id AND po.tenant_id = pl.tenant_id')
      .where('pl.tenant_id = :tenantId', { tenantId })
      .andWhere('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .andWhere('po.po_date >= :from', { from })
      .andWhere('po.po_date <= :to', { to });
    const lines = await qb
      .select(['pl.account_id AS "accountId"', 'pl.line_total AS "lineTotal"', 'pl.quantity AS "quantity"', 'pl.quantity_received AS "quantityReceived"'])
      .getRawMany<{ accountId: string | null; lineTotal: string; quantity: string; quantityReceived: string }>();
    const map = new Map<string, number>();
    for (const l of lines) {
      if (!l.accountId) continue;
      const qty = parseFloat(l.quantity) || 0;
      const recv = parseFloat(l.quantityReceived) || 0;
      const total = parseFloat(l.lineTotal) || 0;
      const openRatio = qty > 0 ? Math.max(0, (qty - recv) / qty) : 1;
      const open = round2(total * openRatio);
      if (open <= 0) continue;
      map.set(l.accountId, round2((map.get(l.accountId) || 0) + open));
    }
    return map;
  }

  // ─── Budget vs Actual ──────────────────────────────────────────────────────

  async getBudgetVsActual(
    tenantId: string,
    filters: BudgetVsActualFilters,
  ): Promise<BudgetVsActualRow[]> {
    const { fiscalYear, period, costCenterId } = filters;

    // Budget lines for the fiscal year (period filter: include matching period OR annual lines).
    const bqb = this.lineRepo
      .createQueryBuilder('bl')
      .where('bl.tenant_id = :tenantId', { tenantId })
      .andWhere('bl.fiscal_year = :fiscalYear', { fiscalYear });
    if (period) bqb.andWhere('(bl.period = :period OR bl.period IS NULL)', { period });
    if (costCenterId) bqb.andWhere('bl.cost_center_id = :costCenterId', { costCenterId });
    const budgetLines = await bqb.getMany();

    const { from, to } = this.dateRange(fiscalYear, period);
    const actuals = await this.actualsByAccount(tenantId, from, to, costCenterId);
    const commitments = await this.commitmentsByAccount(tenantId, fiscalYear, period);

    const [accounts, costCenters] = await Promise.all([
      this.accountRepo.find({ where: { tenantId } }),
      this.costCenterRepo.find({ where: { tenantId } }),
    ]);
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const ccMap = new Map(costCenters.map((c) => [c.id, c]));

    // Aggregate budget by (account, cost center).
    const budgetMap = new Map<string, { glAccountId: string | null; costCenterId: string | null; budget: number }>();
    for (const bl of budgetLines) {
      const key = `${bl.glAccountId ?? ''}|${bl.costCenterId ?? ''}`;
      const existing = budgetMap.get(key);
      if (existing) existing.budget = round2(existing.budget + bl.amount);
      else budgetMap.set(key, { glAccountId: bl.glAccountId, costCenterId: bl.costCenterId, budget: bl.amount });
    }

    // Ensure accounts that have actuals/commitments but no budget line still surface.
    const accountKeys = new Set<string>(budgetMap.keys());
    for (const accId of actuals.keys()) accountKeys.add(`${accId}|${costCenterId ?? ''}`);
    for (const accId of commitments.keys()) accountKeys.add(`${accId}|${costCenterId ?? ''}`);

    const rows: BudgetVsActualRow[] = [];
    for (const key of accountKeys) {
      const [accId, ccId] = key.split('|');
      const glAccountId = accId || null;
      const bm = budgetMap.get(key);
      const budget = bm?.budget ?? 0;
      const actual = glAccountId ? actuals.get(glAccountId) ?? 0 : 0;
      const committed = glAccountId ? commitments.get(glAccountId) ?? 0 : 0;
      const available = round2(budget - committed - actual);
      const variance = round2(budget - actual);
      const used = committed + actual;
      const utilization = budget > 0 ? round2((used / budget) * 100) : used > 0 ? 100 : 0;
      const acc = glAccountId ? accMap.get(glAccountId) : undefined;
      const cc = ccId ? ccMap.get(ccId) : undefined;
      rows.push({
        glAccountId,
        accountCode: acc?.code ?? null,
        accountName: acc?.name ?? null,
        costCenterId: ccId || null,
        costCenterName: cc?.name ?? null,
        budget,
        committed,
        actual,
        available,
        variance,
        utilization,
      });
    }

    rows.sort((a, b) => (a.accountCode ?? '').localeCompare(b.accountCode ?? ''));
    return rows;
  }

  // ─── Budget check (advisory) ───────────────────────────────────────────────

  async checkBudget(
    tenantId: string,
    dto: CheckBudgetDto,
  ): Promise<{ status: BudgetCheckStatus; budget: number; used: number; available: number; requested: number }> {
    const { glAccountId, costCenterId, amount, fiscalYear, period } = dto;

    const bqb = this.lineRepo
      .createQueryBuilder('bl')
      .where('bl.tenant_id = :tenantId', { tenantId })
      .andWhere('bl.fiscal_year = :fiscalYear', { fiscalYear });
    if (glAccountId) bqb.andWhere('bl.gl_account_id = :glAccountId', { glAccountId });
    if (costCenterId) bqb.andWhere('bl.cost_center_id = :costCenterId', { costCenterId });
    if (period) bqb.andWhere('(bl.period = :period OR bl.period IS NULL)', { period });
    const budgetLines = await bqb.getMany();
    const budget = round2(budgetLines.reduce((s, l) => s + l.amount, 0));

    const { from, to } = this.dateRange(fiscalYear, period);
    const actuals = await this.actualsByAccount(tenantId, from, to, costCenterId);
    const commitments = await this.commitmentsByAccount(tenantId, fiscalYear, period);
    const actual = glAccountId ? actuals.get(glAccountId) ?? 0 : 0;
    const committed = glAccountId ? commitments.get(glAccountId) ?? 0 : 0;
    const used = round2(actual + committed);
    const available = round2(budget - used);

    let status: BudgetCheckStatus = 'OK';
    if (budget > 0) {
      const projected = used + amount;
      if (projected > budget) status = 'EXCEEDED';
      else if (projected > budget * 0.9) status = 'WARNING';
    }
    return { status, budget, used, available, requested: amount };
  }

  // ─── Budget line CRUD ──────────────────────────────────────────────────────

  async listLines(tenantId: string, fiscalYear?: number): Promise<BudgetLine[]> {
    const where: any = { tenantId };
    if (fiscalYear) where.fiscalYear = fiscalYear;
    return this.lineRepo.find({ where, order: { fiscalYear: 'DESC', period: 'ASC' } });
  }

  async createLine(tenantId: string, dto: CreateBudgetLineDto): Promise<BudgetLine> {
    const line = this.lineRepo.create({
      tenantId,
      budgetId: dto.budgetId ?? null,
      fiscalYear: dto.fiscalYear,
      period: dto.period ?? null,
      glAccountId: dto.glAccountId ?? null,
      costCenterId: dto.costCenterId ?? null,
      amount: dto.amount,
      notes: dto.notes ?? null,
    });
    return this.lineRepo.save(line);
  }

  async updateLine(tenantId: string, id: string, dto: UpdateBudgetLineDto): Promise<BudgetLine> {
    const line = await this.lineRepo.findOne({ where: { id, tenantId } });
    if (!line) throw new NotFoundException(`Budget line ${id} not found`);
    if (dto.fiscalYear !== undefined) line.fiscalYear = dto.fiscalYear;
    if (dto.period !== undefined) line.period = dto.period;
    if (dto.glAccountId !== undefined) line.glAccountId = dto.glAccountId;
    if (dto.costCenterId !== undefined) line.costCenterId = dto.costCenterId;
    if (dto.amount !== undefined) line.amount = dto.amount;
    if (dto.notes !== undefined) line.notes = dto.notes;
    return this.lineRepo.save(line);
  }

  async deleteLine(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const line = await this.lineRepo.findOne({ where: { id, tenantId } });
    if (!line) throw new NotFoundException(`Budget line ${id} not found`);
    await this.lineRepo.remove(line);
    return { deleted: true };
  }
}
