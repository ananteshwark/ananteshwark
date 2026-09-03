import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReportDefinition } from './entities/report-definition.entity';
import { ReportSchedule, ScheduleFrequency } from './entities/report-schedule.entity';
import { Budget, BudgetStatus } from './entities/budget.entity';
import { KpiDefinition } from './entities/kpi-definition.entity';
import { CreateReportDefinitionDto, RunReportDto, CreateScheduleDto, CreateBudgetDto, CreateKpiDto } from './dto/analytics.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(ReportDefinition) private readonly reportRepo: Repository<ReportDefinition>,
    @InjectRepository(ReportSchedule) private readonly scheduleRepo: Repository<ReportSchedule>,
    @InjectRepository(Budget) private readonly budgetRepo: Repository<Budget>,
    @InjectRepository(KpiDefinition) private readonly kpiRepo: Repository<KpiDefinition>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- Report Definitions ----
  async createReport(tenantId: string, userId: string, dto: CreateReportDefinitionDto): Promise<ReportDefinition> {
    const report = this.reportRepo.create({ ...dto, tenantId, createdById: userId });
    return this.reportRepo.save(report);
  }

  async listReports(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<ReportDefinition>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.reportRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findReport(tenantId: string, id: string): Promise<ReportDefinition> {
    const report = await this.reportRepo.findOne({ where: { tenantId, id } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);
    return report;
  }

  async runReport(tenantId: string, id: string, dto: RunReportDto): Promise<{ columns: any[]; rows: any[] }> {
    const report = await this.findReport(tenantId, id);

    let query = report.sqlQuery;
    const params: any[] = [tenantId];

    for (const [key, val] of Object.entries(dto.parameters ?? {})) {
      query = query.replace(new RegExp(`:${key}`, 'g'), `$${params.length + 1}`);
      params.push(val);
    }

    if (!query.toLowerCase().includes('$1')) {
      query = query.replace(/WHERE/i, `WHERE tenant_id = $1 AND`);
      if (!query.toLowerCase().includes('where')) {
        query += ' WHERE tenant_id = $1';
      }
    }

    try {
      const rows = await this.dataSource.query(query, params);
      return { columns: report.columns, rows };
    } catch (e: any) {
      throw new BadRequestException(`Query execution failed: ${e.message}`);
    }
  }

  // ---- Schedules ----
  async createSchedule(tenantId: string, dto: CreateScheduleDto): Promise<ReportSchedule> {
    const nextRun = this.computeNextRun(dto.frequency);
    const schedule = this.scheduleRepo.create({ ...dto, tenantId, nextRunAt: nextRun });
    return this.scheduleRepo.save(schedule);
  }

  async listSchedules(tenantId: string): Promise<ReportSchedule[]> {
    return this.scheduleRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  private computeNextRun(frequency: ScheduleFrequency): Date {
    const d = new Date();
    if (frequency === ScheduleFrequency.DAILY) d.setDate(d.getDate() + 1);
    if (frequency === ScheduleFrequency.WEEKLY) d.setDate(d.getDate() + 7);
    if (frequency === ScheduleFrequency.MONTHLY) d.setMonth(d.getMonth() + 1);
    return d;
  }

  // ---- Budgets ----
  async createBudget(tenantId: string, dto: CreateBudgetDto): Promise<Budget> {
    const totalBudget = (dto.lines ?? []).reduce((s, l) => s + l.budgetAmount, 0);
    return this.budgetRepo.save(this.budgetRepo.create({ ...dto, tenantId, totalBudget, lines: dto.lines ?? [] }));
  }

  async listBudgets(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Budget>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.budgetRepo.findAndCount({
      where: { tenantId },
      order: { fiscalYear: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async approveBudget(tenantId: string, id: string): Promise<Budget> {
    const budget = await this.budgetRepo.findOne({ where: { tenantId, id } });
    if (!budget) throw new NotFoundException(`Budget ${id} not found`);
    if (budget.status !== BudgetStatus.DRAFT) throw new BadRequestException('Budget must be DRAFT to approve');
    budget.status = BudgetStatus.APPROVED;
    return this.budgetRepo.save(budget);
  }

  async getBudgetVariance(tenantId: string, budgetId: string): Promise<{ lines: any[]; totalBudget: number; totalActual: number; variance: number }> {
    const budget = await this.budgetRepo.findOne({ where: { tenantId, id: budgetId } });
    if (!budget) throw new NotFoundException(`Budget ${budgetId} not found`);

    const actuals: any[] = [];
    for (const line of budget.lines) {
      try {
        const rows = await this.dataSource.query(
          `SELECT COALESCE(SUM(amount), 0) AS actual FROM fin_journal_lines jl
           JOIN fin_journal_entries je ON je.id = jl.journal_entry_id AND je.tenant_id = $1
           WHERE je.status = 'POSTED'
             AND jl.account_code = $2
             AND TO_CHAR(je.entry_date, 'YYYY-MM') = $3`,
          [tenantId, line.accountCode, line.period],
        );
        const actual = Number(rows[0]?.actual ?? 0);
        actuals.push({ ...line, actual, variance: line.budgetAmount - actual });
      } catch {
        actuals.push({ ...line, actual: 0, variance: line.budgetAmount });
      }
    }
    const totalActual = actuals.reduce((s, l) => s + l.actual, 0);
    return { lines: actuals, totalBudget: budget.totalBudget, totalActual, variance: budget.totalBudget - totalActual };
  }

  // ---- KPIs ----
  async createKpi(tenantId: string, dto: CreateKpiDto): Promise<KpiDefinition> {
    return this.kpiRepo.save(this.kpiRepo.create({ ...dto, tenantId }));
  }

  async listKpis(tenantId: string): Promise<KpiDefinition[]> {
    return this.kpiRepo.find({ where: { tenantId, isActive: true }, order: { code: 'ASC' } });
  }

  async evaluateKpi(tenantId: string, id: string): Promise<{ kpi: KpiDefinition; value: number; status: 'ON_TARGET' | 'ABOVE' | 'BELOW' }> {
    const kpi = await this.kpiRepo.findOne({ where: { tenantId, id } });
    if (!kpi) throw new NotFoundException(`KPI ${id} not found`);

    let value = 0;
    try {
      const rows = await this.dataSource.query(kpi.sqlQuery, [tenantId]);
      value = Number(rows[0]?.value ?? rows[0]?.count ?? 0);
    } catch {
      value = 0;
    }

    let status: 'ON_TARGET' | 'ABOVE' | 'BELOW' = 'ON_TARGET';
    if (kpi.targetValue != null) {
      const diff = value - kpi.targetValue;
      if (Math.abs(diff) > kpi.targetValue * 0.05) {
        status = diff > 0 ? 'ABOVE' : 'BELOW';
      }
    }
    return { kpi, value, status };
  }

  async getDashboardKpis(tenantId: string): Promise<any[]> {
    const kpis = await this.listKpis(tenantId);
    return Promise.all(kpis.map(kpi => this.evaluateKpi(tenantId, kpi.id).catch(() => ({ kpi, value: 0, status: 'ON_TARGET' }))));
  }
}
