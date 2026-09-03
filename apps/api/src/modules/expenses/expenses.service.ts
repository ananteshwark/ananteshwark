import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaim, ExpenseClaimStatus } from './entities/expense-claim.entity';
import { ExpenseLine, ExpenseLineType } from './entities/expense-line.entity';
import { ExpensePolicy } from './entities/expense-policy.entity';
import { ExpenseRate, ExpenseRateType } from './entities/expense-rate.entity';
import { ExpenseBudget } from './entities/expense-budget.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { GlService } from '../finance/gl/gl.service';
import { AutomationService } from '../automation/automation.service';
import { JournalSource } from '../finance/gl/entities/journal-entry.entity';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectRepository(ExpenseClaim)
    private readonly claimRepo: Repository<ExpenseClaim>,
    @InjectRepository(ExpenseLine)
    private readonly lineRepo: Repository<ExpenseLine>,
    @InjectRepository(ExpensePolicy)
    private readonly policyRepo: Repository<ExpensePolicy>,
    private readonly glService: GlService,
    @Optional() private readonly automation?: AutomationService,
    @Optional() @InjectRepository(ExpenseRate)
    private readonly rateRepo?: Repository<ExpenseRate>,
    @Optional() @InjectRepository(ExpenseBudget)
    private readonly budgetRepo?: Repository<ExpenseBudget>,
    @Optional() @InjectRepository(Employee)
    private readonly employeeRepo?: Repository<Employee>,
  ) {}

  // ─── Categories ───────────────────────────────────────────────

  async createCategory(tenantId: string, dto: Partial<ExpenseCategory>): Promise<ExpenseCategory> {
    const entity = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(entity);
  }

  async findCategories(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<ExpenseCategory>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.categoryRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: Partial<ExpenseCategory>,
  ): Promise<ExpenseCategory> {
    const cat = await this.categoryRepo.findOne({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException(`Expense category ${id} not found`);
    Object.assign(cat, dto);
    return this.categoryRepo.save(cat);
  }

  // ─── Claim Number Helper ──────────────────────────────────────

  private async nextClaimNumber(tenantId: string): Promise<string> {
    const row = await this.claimRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.claim_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `EXP-${String(next).padStart(6, '0')}`;
  }

  // ─── Claims ───────────────────────────────────────────────────

  /**
   * Resolve the amount of a computed line: per-diem and mileage lines carry a
   * rate reference + quantity (days / km); the amount is rate × quantity.
   */
  private async resolveLineAmount(tenantId: string, l: any): Promise<{ amount: number; lineType: ExpenseLineType; quantity: number | null; rateId: string | null }> {
    const lineType: ExpenseLineType = l.lineType ?? ExpenseLineType.GENERAL;
    if (lineType === ExpenseLineType.GENERAL) {
      return { amount: parseFloat(l.amount) || 0, lineType, quantity: null, rateId: null };
    }
    if (!this.rateRepo) throw new BadRequestException('Rate cards are not available in this deployment');
    if (!l.rateId || !(Number(l.quantity) > 0)) {
      throw new BadRequestException(`${lineType} lines need a rateId and a positive quantity`);
    }
    const rate = await this.rateRepo.findOne({ where: { id: l.rateId, tenantId, isActive: true } });
    if (!rate) throw new NotFoundException(`Expense rate ${l.rateId} not found`);
    const expected = lineType === ExpenseLineType.PER_DIEM ? ExpenseRateType.PER_DIEM : ExpenseRateType.MILEAGE;
    if (rate.rateType !== expected) {
      throw new BadRequestException(`Rate "${rate.name}" is a ${rate.rateType} rate — expected ${expected}`);
    }
    return {
      amount: round2(Number(rate.rate) * Number(l.quantity)),
      lineType,
      quantity: Number(l.quantity),
      rateId: rate.id,
    };
  }

  async createClaim(
    tenantId: string,
    employeeId: string,
    dto: any,
  ): Promise<ExpenseClaim & { lines: ExpenseLine[] }> {
    const claimNumber = await this.nextClaimNumber(tenantId);
    const lines: any[] = dto.lines ?? [];
    const resolved = [] as Array<{ raw: any; amount: number; lineType: ExpenseLineType; quantity: number | null; rateId: string | null }>;
    for (const l of lines) {
      const r = await this.resolveLineAmount(tenantId, l);
      resolved.push({ raw: l, ...r });
    }
    const totalAmount = round2(resolved.reduce((sum, r) => sum + r.amount, 0));

    const claim = this.claimRepo.create({
      tenantId,
      employeeId,
      claimNumber,
      title: dto.title,
      claimDate: dto.claimDate,
      currency: dto.currency ?? 'INR',
      status: ExpenseClaimStatus.DRAFT,
      totalAmount,
    });
    const saved = await this.claimRepo.save(claim);

    const lineEntities = resolved.map((r, idx) =>
      this.lineRepo.create({
        tenantId,
        claimId: saved.id,
        lineNumber: idx + 1,
        categoryId: r.raw.categoryId ?? null,
        description: r.raw.description,
        expenseDate: r.raw.expenseDate,
        amount: r.amount,
        currency: r.raw.currency ?? dto.currency ?? 'INR',
        receiptUrl: r.raw.receiptUrl ?? null,
        taxAmount: r.raw.taxAmount ?? 0,
        projectId: r.raw.projectId ?? null,
        notes: r.raw.notes ?? null,
        lineType: r.lineType,
        quantity: r.quantity,
        rateId: r.rateId,
      }),
    );
    await this.lineRepo.save(lineEntities);
    return this.findClaim(tenantId, saved.id);
  }

  async findClaims(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { employeeId?: string; status?: ExpenseClaimStatus },
  ): Promise<PaginatedResponseDto<ExpenseClaim>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.claimRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (filters?.employeeId)
      qb.andWhere('c.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.status)
      qb.andWhere('c.status = :status', { status: filters.status });
    qb.orderBy('c.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findClaim(
    tenantId: string,
    id: string,
  ): Promise<ExpenseClaim & { lines: ExpenseLine[] }> {
    const claim = await this.claimRepo.findOne({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException(`Expense claim ${id} not found`);
    const lines = await this.lineRepo.find({
      where: { claimId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...claim, lines } as any;
  }

  private async transitionClaim(
    tenantId: string,
    id: string,
    from: ExpenseClaimStatus,
    to: ExpenseClaimStatus,
    extra?: Partial<ExpenseClaim>,
  ): Promise<ExpenseClaim> {
    const claim = await this.claimRepo.findOne({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException(`Expense claim ${id} not found`);
    if (claim.status !== from) {
      throw new BadRequestException(
        `Cannot transition from ${claim.status} to ${to}`,
      );
    }
    claim.status = to;
    if (extra) Object.assign(claim, extra);
    return this.claimRepo.save(claim);
  }

  /**
   * Policy gate at submission: the first active policy whose appliesTo
   * matches the claimant (empty lists match everyone) enforces its claim cap
   * and per-category line limits.
   */
  private async enforcePolicy(tenantId: string, claim: ExpenseClaim & { lines?: ExpenseLine[] }): Promise<void> {
    const policies = await this.policyRepo.find({ where: { tenantId, isActive: true } });
    if (!policies.length) return;

    let employee: Employee | null = null;
    if (this.employeeRepo) {
      employee = await this.employeeRepo.findOne({ where: { id: claim.employeeId, tenantId } as any }).catch(() => null);
    }
    const matches = (p: ExpensePolicy) => {
      const scope = p.appliesTo;
      if (!scope) return true;
      if (scope.departments?.length && (!employee || !scope.departments.includes(employee.departmentId ?? ''))) return false;
      if (scope.designations?.length && (!employee || !scope.designations.includes(employee.designationId ?? ''))) return false;
      return true;
    };
    const policy = policies.find(matches);
    if (!policy) return;

    if (policy.maxClaimAmount != null && Number(claim.totalAmount) > Number(policy.maxClaimAmount)) {
      throw new BadRequestException(
        `Claim total ${claim.totalAmount} exceeds the ${policy.name} limit of ${policy.maxClaimAmount}`,
      );
    }
    const limits = new Map((policy.categoryLimits ?? []).map((cl: any) => [cl.categoryId, Number(cl.maxAmount)]));
    if (limits.size) {
      const lines = claim.lines ?? (await this.lineRepo.find({ where: { claimId: claim.id, tenantId } }));
      for (const line of lines) {
        const cap = line.categoryId ? limits.get(line.categoryId) : undefined;
        if (cap != null && Number(line.amount) > cap) {
          throw new BadRequestException(
            `Line ${line.lineNumber} (${line.description}) exceeds the category limit of ${cap} under ${policy.name}`,
          );
        }
      }
    }
  }

  async submitClaim(tenantId: string, id: string): Promise<ExpenseClaim> {
    const current = await this.findClaim(tenantId, id);
    if (current.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException(`Cannot transition from ${current.status} to ${ExpenseClaimStatus.SUBMITTED}`);
    }
    await this.enforcePolicy(tenantId, current);
    const claim = await this.transitionClaim(tenantId, id, ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.SUBMITTED);
    await this.automation?.emit(tenantId, 'expense.submitted', { claimId: claim.id, claimNumber: claim.claimNumber, employeeId: claim.employeeId, totalAmount: Number(claim.totalAmount) });
    return claim;
  }

  async approveClaim(tenantId: string, id: string, approvedById: string): Promise<ExpenseClaim> {
    const claim = await this.transitionClaim(tenantId, id, ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.APPROVED, {
      approvedById,
      approvedAt: new Date(),
    });
    await this.automation?.emit(tenantId, 'expense.approved', { claimId: claim.id, claimNumber: claim.claimNumber, employeeId: claim.employeeId, totalAmount: Number(claim.totalAmount), approvedById });
    await this.checkBudgetAlerts(tenantId, new Date(claim.claimDate).getFullYear()).catch(() => undefined);
    return claim;
  }

  /** Emit expense.budget_alert for budgets whose consumption crossed their threshold. */
  private async checkBudgetAlerts(tenantId: string, year: number): Promise<void> {
    if (!this.budgetRepo || !this.automation) return;
    const status = await this.budgetStatus(tenantId, year);
    for (const row of status.filter((r) => r.alert)) {
      await this.automation.emit(tenantId, 'expense.budget_alert', {
        budgetId: row.budgetId,
        categoryId: row.categoryId,
        year,
        amount: row.amount,
        consumed: row.consumed,
        consumedPct: row.consumedPct,
        thresholdPct: row.thresholdPct,
      });
    }
  }

  async rejectClaim(
    tenantId: string,
    id: string,
    approvedById: string,
    reason: string,
  ): Promise<ExpenseClaim> {
    const claim = await this.transitionClaim(tenantId, id, ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.REJECTED, {
      approvedById,
      approvedAt: new Date(),
      rejectionReason: reason,
    });
    await this.automation?.emit(tenantId, 'expense.rejected', { claimId: claim.id, claimNumber: claim.claimNumber, employeeId: claim.employeeId, reason });
    return claim;
  }

  // ─── Split, advance offset ────────────────────────────────────

  /**
   * Split a DRAFT claim with colleagues: each split share becomes a DRAFT
   * claim owned by that colleague (lines scaled proportionally, provenance
   * recorded); the original keeps the remainder.
   */
  async splitClaim(
    tenantId: string,
    id: string,
    splits: Array<{ employeeId: string; sharePct: number }>,
  ): Promise<{ original: ExpenseClaim; created: ExpenseClaim[] }> {
    const claim = await this.findClaim(tenantId, id);
    if (claim.status !== ExpenseClaimStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT claims can be split');
    }
    const shares = (splits ?? []).filter((s) => s.employeeId && Number(s.sharePct) > 0);
    if (!shares.length) throw new BadRequestException('At least one split share is required');
    const totalPct = shares.reduce((s, x) => s + Number(x.sharePct), 0);
    if (totalPct >= 100) throw new BadRequestException('Split shares must total less than 100% — the owner keeps the remainder');

    const created: ExpenseClaim[] = [];
    for (const share of shares) {
      const fraction = Number(share.sharePct) / 100;
      const claimNumber = await this.nextClaimNumber(tenantId);
      const copy = await this.claimRepo.save(this.claimRepo.create({
        tenantId,
        employeeId: share.employeeId,
        claimNumber,
        title: `${claim.title} (split ${share.sharePct}%)`,
        claimDate: claim.claimDate,
        currency: claim.currency,
        status: ExpenseClaimStatus.DRAFT,
        totalAmount: round2(Number(claim.totalAmount) * fraction),
        splitFromClaimId: claim.id,
      }));
      await this.lineRepo.save(claim.lines.map((l) => this.lineRepo.create({
        tenantId,
        claimId: copy.id,
        lineNumber: l.lineNumber,
        categoryId: l.categoryId,
        description: l.description,
        expenseDate: l.expenseDate,
        amount: round2(Number(l.amount) * fraction),
        currency: l.currency,
        taxAmount: round2(Number(l.taxAmount) * fraction),
        projectId: l.projectId,
        notes: `Split ${share.sharePct}% of ${claim.claimNumber}`,
        lineType: l.lineType,
      })));
      created.push(copy);
    }

    // Scale the original down to its remaining share.
    const remainder = (100 - totalPct) / 100;
    for (const l of claim.lines) {
      l.amount = round2(Number(l.amount) * remainder);
      l.taxAmount = round2(Number(l.taxAmount) * remainder);
      await this.lineRepo.save(l);
    }
    const originalRow = await this.claimRepo.findOne({ where: { id: claim.id, tenantId } });
    originalRow!.totalAmount = round2(Number(claim.totalAmount) * remainder);
    const original = await this.claimRepo.save(originalRow!);
    return { original, created };
  }

  /** Record an advance offset on an APPROVED claim; payout nets it off. */
  async applyAdvanceOffset(
    tenantId: string,
    id: string,
    dto: { advanceId: string; amount: number },
  ): Promise<ExpenseClaim> {
    const claim = await this.claimRepo.findOne({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException(`Expense claim ${id} not found`);
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('Advance offsets apply to APPROVED claims before payment');
    }
    const amount = Number(dto.amount);
    if (!(amount > 0)) throw new BadRequestException('Offset amount must be positive');
    if (amount > Number(claim.totalAmount)) {
      throw new BadRequestException(`Offset ${amount} exceeds the claim total ${claim.totalAmount}`);
    }
    claim.advanceId = dto.advanceId;
    claim.advanceDeduction = amount;
    return this.claimRepo.save(claim);
  }

  async markPaid(tenantId: string, id: string, userId: string): Promise<ExpenseClaim> {
    const claim = await this.findClaim(tenantId, id);
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('Only approved claims can be marked paid');
    }

    // Best-effort GL posting: look up a catch-all "Expenses" account by code prefix
    const expenseAccount = await this.glService.findAccounts(tenantId, { limit: 1, page: 1, sortBy: 'code', sortOrder: 'ASC' }, { search: '6000' }).catch(() => null);
    if (expenseAccount?.items?.length) {
      const acctId = expenseAccount.items[0].id;
      const amount = Number(claim.totalAmount);
      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: new Date().toISOString().split('T')[0],
          description: `Expense reimbursement — ${claim.claimNumber}`,
          reference: claim.claimNumber,
          source: JournalSource.MANUAL,
          currency: claim.currency,
          lines: [
            { accountId: acctId, description: `Expense ${claim.claimNumber}`, debit: amount, credit: 0 },
            { accountId: acctId, description: `Reimbursement ${claim.claimNumber}`, debit: 0, credit: amount },
          ],
        },
        userId,
      ).catch(() => null);
      if (je) claim.journalEntryId = je.id;
    }

    claim.status = ExpenseClaimStatus.PAID;
    claim.paidAt = new Date();
    const paid = await this.claimRepo.save(claim);
    await this.automation?.emit(tenantId, 'expense.paid', {
      claimId: paid.id, claimNumber: paid.claimNumber, employeeId: paid.employeeId,
      totalAmount: Number(paid.totalAmount),
      advanceDeduction: Number(paid.advanceDeduction ?? 0),
      netPaid: round2(Number(paid.totalAmount) - Number(paid.advanceDeduction ?? 0)),
    });
    return paid;
  }

  // ─── Policies ─────────────────────────────────────────────────

  async createPolicy(tenantId: string, dto: Partial<ExpensePolicy>): Promise<ExpensePolicy> {
    const entity = this.policyRepo.create({ ...dto, tenantId });
    return this.policyRepo.save(entity);
  }

  async findPolicies(tenantId: string): Promise<ExpensePolicy[]> {
    return this.policyRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async updatePolicy(tenantId: string, id: string, dto: Partial<ExpensePolicy>): Promise<ExpensePolicy> {
    const policy = await this.policyRepo.findOne({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException(`Expense policy ${id} not found`);
    Object.assign(policy, dto);
    return this.policyRepo.save(policy);
  }

  // ─── Rate cards (per-diem / mileage) ──────────────────────────

  async createRate(tenantId: string, dto: Partial<ExpenseRate>): Promise<ExpenseRate> {
    if (!this.rateRepo) throw new BadRequestException('Rate cards are not available in this deployment');
    if (!dto.name?.trim() || !dto.classifier?.trim() || !(Number(dto.rate) > 0)) {
      throw new BadRequestException('name, classifier and a positive rate are required');
    }
    if (!dto.rateType || !Object.values(ExpenseRateType).includes(dto.rateType)) {
      throw new BadRequestException(`rateType must be one of ${Object.values(ExpenseRateType).join(', ')}`);
    }
    return this.rateRepo.save(this.rateRepo.create({ ...dto, tenantId }));
  }

  async listRates(tenantId: string, rateType?: ExpenseRateType): Promise<ExpenseRate[]> {
    if (!this.rateRepo) return [];
    const where: any = { tenantId, isActive: true };
    if (rateType) where.rateType = rateType;
    return this.rateRepo.find({ where, order: { name: 'ASC' } });
  }

  // ─── Budgets ──────────────────────────────────────────────────

  async createBudget(tenantId: string, dto: Partial<ExpenseBudget>): Promise<ExpenseBudget> {
    if (!this.budgetRepo) throw new BadRequestException('Expense budgets are not available in this deployment');
    if (!dto.year || !(Number(dto.amount) > 0)) {
      throw new BadRequestException('year and a positive amount are required');
    }
    return this.budgetRepo.save(this.budgetRepo.create({ ...dto, tenantId }));
  }

  /**
   * Consumption per budget: sum of APPROVED/PAID claim lines in the budget's
   * category (or all lines for the all-categories budget) for the year.
   */
  async budgetStatus(tenantId: string, year: number): Promise<Array<{
    budgetId: string; categoryId: string | null; amount: number;
    consumed: number; consumedPct: number; thresholdPct: number; alert: boolean;
  }>> {
    if (!this.budgetRepo) return [];
    const budgets = await this.budgetRepo.find({ where: { tenantId, year, isActive: true } });
    if (!budgets.length) return [];

    const rows = [];
    for (const b of budgets) {
      const qb = this.lineRepo.createQueryBuilder('l')
        .innerJoin(ExpenseClaim, 'c', 'c.id = l.claim_id')
        .select('COALESCE(SUM(l.amount), 0)', 'sum')
        .where('l.tenant_id = :tenantId', { tenantId })
        .andWhere('c.status IN (:...statuses)', { statuses: [ExpenseClaimStatus.APPROVED, ExpenseClaimStatus.PAID] })
        .andWhere('l.expense_date BETWEEN :from AND :to', { from: `${year}-01-01`, to: `${year}-12-31` });
      if (b.categoryId) qb.andWhere('l.category_id = :cat', { cat: b.categoryId });
      const raw = await qb.getRawOne<{ sum: string }>();
      const consumed = round2(Number(raw?.sum ?? 0));
      const consumedPct = Number(b.amount) > 0 ? Math.round((consumed / Number(b.amount)) * 100) : 0;
      rows.push({
        budgetId: b.id,
        categoryId: b.categoryId,
        amount: Number(b.amount),
        consumed,
        consumedPct,
        thresholdPct: b.alertThresholdPct,
        alert: consumedPct >= b.alertThresholdPct,
      });
    }
    return rows;
  }
}
