import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SurveyActionPlan, ActionPlanStatus, ActionItem, ActionItemStatus,
  AttritionWatch, WatchStatus,
} from './entities/action-planning.entity';
import { AutomationService } from '../automation/automation.service';

function bandFor(score: number): string {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

@Injectable()
export class ActionPlanningService {
  constructor(
    @InjectRepository(SurveyActionPlan) private readonly planRepo: Repository<SurveyActionPlan>,
    @InjectRepository(ActionItem) private readonly itemRepo: Repository<ActionItem>,
    @InjectRepository(AttritionWatch) private readonly watchRepo: Repository<AttritionWatch>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Survey action plans ──────────────────────────────────────

  async createPlan(tenantId: string, dto: { title: string; surveyId?: string; focusArea?: string; orgUnitId?: string; ownerUserId?: string; targetDate?: string; drivers?: any[] }): Promise<SurveyActionPlan> {
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    const plan = await this.planRepo.save(this.planRepo.create({
      tenantId, title: dto.title.trim(), surveyId: dto.surveyId ?? null, focusArea: dto.focusArea ?? null,
      orgUnitId: dto.orgUnitId ?? null, ownerUserId: dto.ownerUserId ?? null, targetDate: dto.targetDate ?? null,
      drivers: dto.drivers ?? [], status: ActionPlanStatus.OPEN,
    }));
    await this.automation?.emit(tenantId, 'action_plan.created', { planId: plan.id, title: plan.title, focusArea: plan.focusArea });
    return plan;
  }

  listPlans(tenantId: string, status?: ActionPlanStatus): Promise<SurveyActionPlan[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getPlan(tenantId: string, id: string): Promise<{ plan: SurveyActionPlan; items: ActionItem[]; progressPct: number }> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Action plan ${id} not found`);
    const items = await this.itemRepo.find({ where: { tenantId, planId: id }, order: { createdAt: 'ASC' } });
    const done = items.filter((i) => i.status === ActionItemStatus.DONE).length;
    const progressPct = items.length ? Math.round((done / items.length) * 100) : 0;
    return { plan, items, progressPct };
  }

  async addItem(tenantId: string, planId: string, dto: { title: string; ownerUserId?: string; dueDate?: string; note?: string }): Promise<ActionItem> {
    await this.assertPlan(tenantId, planId);
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    return this.itemRepo.save(this.itemRepo.create({
      tenantId, planId, title: dto.title.trim(), ownerUserId: dto.ownerUserId ?? null,
      dueDate: dto.dueDate ?? null, note: dto.note ?? null, status: ActionItemStatus.TODO,
    }));
  }

  private async assertPlan(tenantId: string, id: string): Promise<SurveyActionPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Action plan ${id} not found`);
    return plan;
  }

  async updateItemStatus(tenantId: string, itemId: string, status: ActionItemStatus): Promise<ActionItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException(`Action item ${itemId} not found`);
    item.status = status;
    item.completedAt = status === ActionItemStatus.DONE ? new Date() : null;
    const saved = await this.itemRepo.save(item);
    await this.maybeAdvancePlan(tenantId, item.planId);
    return saved;
  }

  /** Auto-progress the plan: any DONE/DOING → IN_PROGRESS; all DONE → COMPLETED. */
  private async maybeAdvancePlan(tenantId: string, planId: string): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan || plan.status === ActionPlanStatus.CANCELLED || plan.status === ActionPlanStatus.COMPLETED) return;
    const items = await this.itemRepo.find({ where: { tenantId, planId } });
    if (!items.length) return;
    if (items.every((i) => i.status === ActionItemStatus.DONE)) {
      plan.status = ActionPlanStatus.COMPLETED;
      plan.completedAt = new Date();
    } else if (items.some((i) => i.status !== ActionItemStatus.TODO)) {
      plan.status = ActionPlanStatus.IN_PROGRESS;
    }
    await this.planRepo.save(plan);
  }

  async setPlanStatus(tenantId: string, id: string, status: ActionPlanStatus): Promise<SurveyActionPlan> {
    const plan = await this.assertPlan(tenantId, id);
    plan.status = status;
    if (status === ActionPlanStatus.COMPLETED) plan.completedAt = new Date();
    return this.planRepo.save(plan);
  }

  // ─── Attrition watchlist ──────────────────────────────────────

  async addToWatch(tenantId: string, dto: { employeeId: string; employeeName: string; riskScore?: number; reasons?: string[]; ownerUserId?: string }): Promise<AttritionWatch> {
    if (!dto.employeeId || !dto.employeeName?.trim()) throw new BadRequestException('employeeId and employeeName are required');
    const score = dto.riskScore != null ? Number(dto.riskScore) : null;
    const existing = await this.watchRepo.findOne({ where: { tenantId, employeeId: dto.employeeId } });
    if (existing && existing.status === WatchStatus.WATCHING) {
      // Refresh the score/reasons on an active watch instead of duplicating.
      if (score != null) { existing.riskScore = score; existing.riskBand = bandFor(score); }
      if (dto.reasons) existing.reasons = dto.reasons;
      return this.watchRepo.save(existing);
    }
    const watch = await this.watchRepo.save(this.watchRepo.create({
      tenantId, employeeId: dto.employeeId, employeeName: dto.employeeName.trim(),
      riskScore: score, riskBand: score != null ? bandFor(score) : 'MEDIUM',
      reasons: dto.reasons ?? [], ownerUserId: dto.ownerUserId ?? null, status: WatchStatus.WATCHING, retentionActions: [],
    }));
    await this.automation?.emit(tenantId, 'attrition.flagged', {
      watchId: watch.id, employeeId: watch.employeeId, riskBand: watch.riskBand, riskScore: watch.riskScore,
    });
    return watch;
  }

  listWatch(tenantId: string, filter: { status?: WatchStatus; riskBand?: string }): Promise<AttritionWatch[]> {
    const where: any = { tenantId };
    if (filter.status) where.status = filter.status;
    if (filter.riskBand) where.riskBand = filter.riskBand;
    return this.watchRepo.find({ where, order: { riskScore: 'DESC' } });
  }

  async updateWatchStatus(tenantId: string, id: string, status: WatchStatus): Promise<AttritionWatch> {
    const watch = await this.findWatch(tenantId, id);
    watch.status = status;
    return this.watchRepo.save(watch);
  }

  async addRetentionAction(tenantId: string, id: string, dto: { action: string; at?: string; by?: string }): Promise<AttritionWatch> {
    const watch = await this.findWatch(tenantId, id);
    if (!dto.action?.trim()) throw new BadRequestException('action is required');
    watch.retentionActions = [...watch.retentionActions, { action: dto.action.trim(), at: dto.at ?? new Date().toISOString().slice(0, 10), by: dto.by }];
    if (watch.status === WatchStatus.WATCHING) watch.status = WatchStatus.ACTIONED;
    return this.watchRepo.save(watch);
  }

  private async findWatch(tenantId: string, id: string): Promise<AttritionWatch> {
    const watch = await this.watchRepo.findOne({ where: { id, tenantId } });
    if (!watch) throw new NotFoundException(`Watch entry ${id} not found`);
    return watch;
  }

  async watchSummary(tenantId: string): Promise<{ byBand: Record<string, number>; byStatus: Record<string, number>; total: number }> {
    const all = await this.watchRepo.find({ where: { tenantId } });
    const byBand: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const w of all) {
      byBand[w.riskBand] = (byBand[w.riskBand] ?? 0) + 1;
      byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    }
    return { byBand, byStatus, total: all.length };
  }
}
