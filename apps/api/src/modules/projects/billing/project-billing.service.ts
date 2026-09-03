import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ProjectBudget, BudgetStatus } from './entities/project-budget.entity';
import { ProjectBudgetLine } from './entities/project-budget-line.entity';
import { BillingRate } from './entities/billing-rate.entity';
import { RevenueRecognitionEntry, RecognitionMethod } from './entities/revenue-recognition.entity';
import { ProjectTimeEntry } from '../entities/project-time-entry.entity';
import { ProjectExpense, ProjectExpenseStatus } from '../entities/project-expense.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ProjectBillingService {
  constructor(
    @InjectRepository(ProjectBudget) private readonly budgetRepo: Repository<ProjectBudget>,
    @InjectRepository(ProjectBudgetLine) private readonly lineRepo: Repository<ProjectBudgetLine>,
    @InjectRepository(BillingRate) private readonly rateRepo: Repository<BillingRate>,
    @InjectRepository(RevenueRecognitionEntry) private readonly recogRepo: Repository<RevenueRecognitionEntry>,
    @InjectRepository(ProjectTimeEntry) private readonly timeRepo: Repository<ProjectTimeEntry>,
    @InjectRepository(ProjectExpense) private readonly expenseRepo: Repository<ProjectExpense>,
  ) {}

  // ─── Ph-237: project budgets ──────────────────────────────────────

  private async saveBudget(tenantId: string, projectId: string, version: number, status: BudgetStatus, lines: any[], notes?: string): Promise<any> {
    const total = round2(lines.reduce((s, l) => s + (Number(l.budgetAmount) || 0), 0));
    const budget = (await this.budgetRepo.save(this.budgetRepo.create({
      tenantId, projectId, version, status, totalAmount: total, notes: notes ?? null,
    } as any))) as unknown as ProjectBudget;
    for (const l of lines) {
      await this.lineRepo.save(this.lineRepo.create({
        tenantId, budgetId: budget.id, projectId, taskId: l.taskId ?? null, resourceId: l.resourceId ?? null,
        glAccountCode: l.glAccountCode ?? null, budgetAmount: l.budgetAmount ?? 0, budgetHours: l.budgetHours ?? 0,
      } as any));
    }
    return { budget, lineCount: lines.length };
  }

  async createBudget(tenantId: string, projectId: string, lines: any[], notes?: string): Promise<any> {
    if (!lines?.length) throw new BadRequestException('at least one budget line is required');
    const existing = await this.budgetRepo.findOne({ where: { tenantId, projectId }, order: { version: 'DESC' } });
    if (existing) throw new BadRequestException('Budget exists; use revise to add a new version');
    return this.saveBudget(tenantId, projectId, 1, BudgetStatus.BASELINE, lines, notes);
  }

  async reviseBudget(tenantId: string, projectId: string, lines: any[], notes?: string): Promise<any> {
    if (!lines?.length) throw new BadRequestException('at least one budget line is required');
    const latest = await this.budgetRepo.findOne({ where: { tenantId, projectId }, order: { version: 'DESC' } });
    if (!latest) throw new NotFoundException('No baseline budget to revise');
    latest.status = BudgetStatus.ARCHIVED;
    await this.budgetRepo.save(latest);
    return this.saveBudget(tenantId, projectId, latest.version + 1, BudgetStatus.REVISED, lines, notes);
  }

  async activeBudgetLines(tenantId: string, projectId: string): Promise<ProjectBudgetLine[]> {
    const latest = await this.budgetRepo.findOne({ where: { tenantId, projectId }, order: { version: 'DESC' } });
    if (!latest) return [];
    return this.lineRepo.find({ where: { tenantId, budgetId: latest.id } });
  }

  // ─── rate resolution ──────────────────────────────────────────────

  async setRate(tenantId: string, data: { projectId?: string; resourceId?: string; role?: string; ratePerHour: number; currency?: string }): Promise<BillingRate> {
    if (data.ratePerHour == null || data.ratePerHour < 0) throw new BadRequestException('ratePerHour must be >= 0');
    const r = this.rateRepo.create({
      tenantId, projectId: data.projectId ?? null, resourceId: data.resourceId ?? null, role: data.role ?? null,
      ratePerHour: data.ratePerHour, currency: data.currency ?? 'INR',
    } as any) as unknown as BillingRate;
    return (this.rateRepo.save(r) as unknown) as Promise<BillingRate>;
  }

  private resolveRate(rates: BillingRate[], projectId: string, resourceId: string): number {
    const exact = rates.find((r) => r.projectId === projectId && r.resourceId === resourceId);
    if (exact) return Number(exact.ratePerHour);
    const projDefault = rates.find((r) => r.projectId === projectId && !r.resourceId);
    if (projDefault) return Number(projDefault.ratePerHour);
    const global = rates.find((r) => !r.projectId && !r.resourceId);
    return global ? Number(global.ratePerHour) : 0;
  }

  // ─── Ph-238: budget vs actual + EAC ───────────────────────────────

  /**
   * Compare active budget lines to actual cost (billable+non-billable time ×
   * rate + expenses) per task, with an estimate-at-completion.
   */
  async budgetVsActual(tenantId: string, projectId: string): Promise<any> {
    const lines = await this.activeBudgetLines(tenantId, projectId);
    const [rates, times, expenses] = await Promise.all([
      this.rateRepo.find({ where: { tenantId } }),
      this.timeRepo.find({ where: { tenantId, projectId } }),
      this.expenseRepo.find({ where: { tenantId, projectId } }),
    ]);
    const actualByTask = new Map<string, number>();
    let projectExpenseTotal = 0;
    for (const t of times) {
      const rate = this.resolveRate(rates, projectId, t.employeeId);
      const cost = round2(Number(t.hours) * rate);
      const key = t.taskId ?? 'UNASSIGNED';
      actualByTask.set(key, round2((actualByTask.get(key) ?? 0) + cost));
    }
    for (const e of expenses) projectExpenseTotal = round2(projectExpenseTotal + Number(e.amount));

    const rows = lines.map((l) => {
      const key = l.taskId ?? 'UNASSIGNED';
      const actual = actualByTask.get(key) ?? 0;
      const budget = Number(l.budgetAmount);
      const eac = round2(Math.max(budget, actual)); // never below budget once tracking
      return { taskId: l.taskId, budget, actual, variance: round2(budget - actual), eac };
    });
    const totalBudget = round2(rows.reduce((s, r) => s + r.budget, 0));
    const totalActual = round2(rows.reduce((s, r) => s + r.actual, 0) + projectExpenseTotal);
    return {
      projectId, totalBudget, totalActual, expenseTotal: projectExpenseTotal,
      variance: round2(totalBudget - totalActual),
      eac: round2(Math.max(totalBudget, totalActual)),
      tasks: rows,
    };
  }

  // ─── Ph-239: T&M billing ──────────────────────────────────────────

  /**
   * Generate a T&M invoice draft: billable time × rate + approved expenses in
   * the date range.
   */
  async generateTmInvoice(tenantId: string, projectId: string, fromDate: string, toDate: string): Promise<any> {
    const rates = await this.rateRepo.find({ where: { tenantId } });
    const times = await this.timeRepo.find({ where: { tenantId, projectId, date: Between(fromDate, toDate) } });
    const expenses = await this.expenseRepo.find({ where: { tenantId, projectId, date: Between(fromDate, toDate) } });

    const labor = times.filter((t) => t.billable).map((t) => {
      const rate = this.resolveRate(rates, projectId, t.employeeId);
      return { type: 'LABOR', employeeId: t.employeeId, date: t.date, hours: Number(t.hours), rate, amount: round2(Number(t.hours) * rate) };
    });
    const expenseLines = expenses.filter((e) => e.status === ProjectExpenseStatus.APPROVED).map((e) => ({ type: 'EXPENSE', description: e.description, date: e.date, amount: Number(e.amount) }));
    const laborTotal = round2(labor.reduce((s, l) => s + l.amount, 0));
    const expenseTotal = round2(expenseLines.reduce((s, l) => s + l.amount, 0));
    return { projectId, fromDate, toDate, labor, expenses: expenseLines, laborTotal, expenseTotal, total: round2(laborTotal + expenseTotal) };
  }

  // ─── Ph-240: fixed-price billing schedule ─────────────────────────

  /** Build a milestone/percentage billing schedule from a contract value. */
  fixedPriceSchedule(contractValue: number, milestones: Array<{ name: string; pct: number }>): any {
    if (!milestones?.length) throw new BadRequestException('milestones are required');
    const totalPct = round2(milestones.reduce((s, m) => s + Number(m.pct), 0));
    if (Math.abs(totalPct - 100) > 0.01) throw new BadRequestException(`Milestone percentages must sum to 100 (got ${totalPct})`);
    let cumulative = 0;
    const schedule = milestones.map((m) => {
      const amount = round2((contractValue * Number(m.pct)) / 100);
      cumulative = round2(cumulative + amount);
      return { name: m.name, pct: Number(m.pct), amount, cumulative };
    });
    return { contractValue: round2(contractValue), schedule };
  }

  // ─── Ph-241: revenue recognition ──────────────────────────────────

  private async cumulativeFor(tenantId: string, projectId: string): Promise<number> {
    const prior = await this.recogRepo.find({ where: { tenantId, projectId } });
    return round2(prior.reduce((s, r) => s + Number(r.recognizedAmount), 0));
  }

  /** POC recognition: contractValue × (costToDate / estTotalCost) − prior cumulative. */
  async recognizePoc(tenantId: string, data: { projectId: string; period: string; contractValue: number; costToDate: number; estimatedTotalCost: number }): Promise<RevenueRecognitionEntry> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    if (!data.estimatedTotalCost || data.estimatedTotalCost <= 0) throw new BadRequestException('estimatedTotalCost must be > 0');
    const pocPct = round2(Math.min(100, (Number(data.costToDate) / Number(data.estimatedTotalCost)) * 100));
    const priorCumulative = await this.cumulativeFor(tenantId, data.projectId);
    const earnedToDate = round2((Number(data.contractValue) * pocPct) / 100);
    const recognized = round2(Math.max(0, earnedToDate - priorCumulative));
    return this.persistRecognition(tenantId, data.projectId, data.period, RecognitionMethod.POC, Number(data.contractValue), pocPct, recognized, priorCumulative);
  }

  /** Milestone recognition: recognize a fixed amount on milestone completion. */
  async recognizeMilestone(tenantId: string, data: { projectId: string; period: string; amount: number; contractValue?: number }): Promise<RevenueRecognitionEntry> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    if (data.amount == null || data.amount < 0) throw new BadRequestException('amount must be >= 0');
    const priorCumulative = await this.cumulativeFor(tenantId, data.projectId);
    return this.persistRecognition(tenantId, data.projectId, data.period, RecognitionMethod.MILESTONE, Number(data.contractValue ?? 0), 0, round2(Number(data.amount)), priorCumulative);
  }

  /** Completed-contract: recognize the full remaining contract value at completion. */
  async recognizeCompleted(tenantId: string, data: { projectId: string; period: string; contractValue: number }): Promise<RevenueRecognitionEntry> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    const priorCumulative = await this.cumulativeFor(tenantId, data.projectId);
    const recognized = round2(Math.max(0, Number(data.contractValue) - priorCumulative));
    return this.persistRecognition(tenantId, data.projectId, data.period, RecognitionMethod.COMPLETED_CONTRACT, Number(data.contractValue), 100, recognized, priorCumulative);
  }

  private async persistRecognition(tenantId: string, projectId: string, period: string, method: RecognitionMethod, contractValue: number, pocPct: number, recognized: number, priorCumulative: number): Promise<RevenueRecognitionEntry> {
    const entry = this.recogRepo.create({
      tenantId, projectId, period, method, contractValue, pocPct,
      recognizedAmount: recognized, cumulativeRecognized: round2(priorCumulative + recognized), notes: null,
    } as any) as unknown as RevenueRecognitionEntry;
    return (this.recogRepo.save(entry) as unknown) as Promise<RevenueRecognitionEntry>;
  }

  recognitionHistory(tenantId: string, projectId: string): Promise<RevenueRecognitionEntry[]> {
    return this.recogRepo.find({ where: { tenantId, projectId }, order: { createdAt: 'ASC' } });
  }
}
