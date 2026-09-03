import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeritPlan, MeritPlanStatus, MeritCycleType } from './entities/merit-plan.entity';
import { MeritBudgetNode } from './entities/merit-budget.entity';
import { MeritLine, MeritLineStatus } from './entities/merit-line.entity';
import { AutomationService } from '../../automation/automation.service';
import { LettersService } from '../../letters/letters.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export interface IncrementModelInput {
  overallBudgetPct: number;
  spreadPct?: number;
  ratings: Array<{ rating: string; multiplier: number; populationPct: number }>;
}

@Injectable()
export class MeritService {
  constructor(
    @InjectRepository(MeritPlan) private readonly planRepo: Repository<MeritPlan>,
    @InjectRepository(MeritBudgetNode) private readonly budgetRepo: Repository<MeritBudgetNode>,
    @InjectRepository(MeritLine) private readonly lineRepo: Repository<MeritLine>,
    @Optional() private readonly automation?: AutomationService,
    @Optional() private readonly letters?: LettersService,
  ) {}

  // ─── Plan lifecycle ───────────────────────────────────────────

  async createPlan(
    tenantId: string, createdByUserId: string,
    dto: { name: string; cycleType?: MeritCycleType; effectiveDate: string; geographies?: any[] },
  ): Promise<MeritPlan> {
    if (!dto.name?.trim() || !dto.effectiveDate) throw new BadRequestException('name and effectiveDate are required');
    return this.planRepo.save(this.planRepo.create({
      tenantId,
      name: dto.name.trim(),
      cycleType: dto.cycleType ?? MeritCycleType.MERIT,
      effectiveDate: dto.effectiveDate,
      geographies: dto.geographies ?? [],
      status: MeritPlanStatus.DRAFT,
      createdByUserId,
    }));
  }

  async listPlans(tenantId: string, status?: MeritPlanStatus): Promise<MeritPlan[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getPlan(tenantId: string, id: string): Promise<MeritPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Merit plan ${id} not found`);
    return plan;
  }

  async configurePlan(
    tenantId: string, id: string,
    dto: Partial<Pick<MeritPlan, 'geographies' | 'incrementRanges' | 'approverLevels' | 'requiresBuApproval' | 'requiresChroApproval' | 'maxCompaRatio'>>,
  ): Promise<MeritPlan> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.DRAFT) throw new BadRequestException('Only DRAFT plans can be reconfigured');
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  /**
   * Questionnaire-driven increment grid: given an overall budget %, a set of
   * ratings with relative multipliers and their population share, produce a
   * per-rating grid (min/target/max %) whose population-weighted average
   * target equals the budget.
   */
  buildIncrementGrid(input: IncrementModelInput): Array<{ rating: string; minPct: number; maxPct: number; targetPct: number }> {
    const ratings = (input.ratings ?? []).filter((r) => r.rating?.trim());
    if (!ratings.length) throw new BadRequestException('At least one rating band is required');
    if (!(input.overallBudgetPct >= 0)) throw new BadRequestException('overallBudgetPct must be non-negative');
    const totalPop = ratings.reduce((s, r) => s + Number(r.populationPct), 0);
    if (totalPop <= 0) throw new BadRequestException('Population percentages must sum to a positive value');

    const weightedAvgMultiplier = ratings.reduce((s, r) => s + (Number(r.populationPct) / totalPop) * Number(r.multiplier), 0);
    const scale = weightedAvgMultiplier > 0 ? input.overallBudgetPct / weightedAvgMultiplier : 0;
    const spread = Number(input.spreadPct ?? 0);
    return ratings.map((r) => {
      const target = round2(Number(r.multiplier) * scale);
      return {
        rating: r.rating.trim(),
        targetPct: target,
        minPct: round2(Math.max(0, target - spread)),
        maxPct: round2(target + spread),
      };
    });
  }

  async applyIncrementGrid(tenantId: string, id: string, input: IncrementModelInput): Promise<MeritPlan> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.DRAFT) throw new BadRequestException('Only DRAFT plans can be modelled');
    plan.incrementRanges = this.buildIncrementGrid(input);
    return this.planRepo.save(plan);
  }

  async submitForHrbpReview(tenantId: string, id: string): Promise<MeritPlan> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.DRAFT) throw new BadRequestException('Only DRAFT plans can go to HRBP review');
    if (!plan.incrementRanges.length) throw new BadRequestException('Configure an increment grid before HRBP review');
    plan.status = MeritPlanStatus.HRBP_REVIEW;
    return this.planRepo.save(plan);
  }

  async launch(tenantId: string, id: string): Promise<MeritPlan> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.HRBP_REVIEW) throw new BadRequestException('Plans launch from HRBP_REVIEW');
    plan.status = MeritPlanStatus.LAUNCHED;
    plan.launchedAt = new Date();
    const saved = await this.planRepo.save(plan);
    await this.automation?.emit(tenantId, 'merit.launched', {
      planId: saved.id, name: saved.name, cycleType: saved.cycleType,
    });
    return saved;
  }

  // ─── Budget tree ──────────────────────────────────────────────

  async addBudgetNode(
    tenantId: string, planId: string,
    dto: { name: string; level?: string; parentId?: string; orgUnitId?: string; holderUserId?: string; currency?: string; allocatedAmount?: number },
  ): Promise<MeritBudgetNode> {
    await this.getPlan(tenantId, planId);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (dto.parentId) {
      const parent = await this.budgetRepo.findOne({ where: { id: dto.parentId, tenantId, planId } });
      if (!parent) throw new NotFoundException(`Parent budget node ${dto.parentId} not found`);
    }
    return this.budgetRepo.save(this.budgetRepo.create({
      tenantId, planId,
      name: dto.name.trim(),
      level: dto.level ?? 'MANAGER',
      parentId: dto.parentId ?? null,
      orgUnitId: dto.orgUnitId ?? null,
      holderUserId: dto.holderUserId ?? null,
      currency: dto.currency ?? 'USD',
      allocatedAmount: dto.allocatedAmount ?? 0,
    }));
  }

  /**
   * Redistribute a parent node's allocation across its children. The child
   * allocations must not exceed the parent's own allocation.
   */
  async redistributeBudget(
    tenantId: string, parentId: string,
    allocations: Array<{ nodeId: string; amount: number }>,
  ): Promise<MeritBudgetNode[]> {
    const parent = await this.budgetRepo.findOne({ where: { id: parentId, tenantId } });
    if (!parent) throw new NotFoundException(`Budget node ${parentId} not found`);
    const total = (allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
    if (total > Number(parent.allocatedAmount)) {
      throw new BadRequestException(`Child allocations (${total}) exceed the parent budget of ${parent.allocatedAmount}`);
    }
    const updated: MeritBudgetNode[] = [];
    for (const a of allocations) {
      const node = await this.budgetRepo.findOne({ where: { id: a.nodeId, tenantId, parentId } });
      if (!node) throw new BadRequestException(`Node ${a.nodeId} is not a child of ${parentId}`);
      node.allocatedAmount = round2(Number(a.amount));
      updated.push(await this.budgetRepo.save(node));
    }
    return updated;
  }

  async delegateBudget(tenantId: string, nodeId: string, delegatedToUserId: string | null): Promise<MeritBudgetNode> {
    const node = await this.budgetRepo.findOne({ where: { id: nodeId, tenantId } });
    if (!node) throw new NotFoundException(`Budget node ${nodeId} not found`);
    node.delegatedToUserId = delegatedToUserId;
    return this.budgetRepo.save(node);
  }

  /** Consumption per budget node: sum of proposed increments on its lines. */
  async budgetConsumption(tenantId: string, planId: string): Promise<Array<{
    nodeId: string; name: string; allocated: number; consumed: number; remaining: number; overBudget: boolean;
  }>> {
    const nodes = await this.budgetRepo.find({ where: { tenantId, planId } });
    const lines = await this.lineRepo.find({ where: { tenantId, planId } });
    const consumedByNode = new Map<string, number>();
    for (const line of lines) {
      if (!line.budgetId) continue;
      consumedByNode.set(line.budgetId, round2((consumedByNode.get(line.budgetId) ?? 0) + Number(line.proposedAmount)));
    }
    return nodes.map((n) => {
      const consumed = consumedByNode.get(n.id) ?? 0;
      return {
        nodeId: n.id, name: n.name,
        allocated: Number(n.allocatedAmount), consumed,
        remaining: round2(Number(n.allocatedAmount) - consumed),
        overBudget: consumed > Number(n.allocatedAmount),
      };
    });
  }

  // ─── Worksheet lines ──────────────────────────────────────────

  async addLine(
    tenantId: string, planId: string,
    dto: { employeeId: string; employeeName: string; currentSalary: number; currency?: string; performanceRating?: string; rangeMidpoint?: number; budgetId?: string; demographic?: string },
  ): Promise<MeritLine> {
    await this.getPlan(tenantId, planId);
    if (!dto.employeeId || !(Number(dto.currentSalary) > 0)) {
      throw new BadRequestException('employeeId and a positive currentSalary are required');
    }
    return this.lineRepo.save(this.lineRepo.create({
      tenantId, planId,
      budgetId: dto.budgetId ?? null,
      employeeId: dto.employeeId,
      employeeName: dto.employeeName,
      currency: dto.currency ?? 'USD',
      currentSalary: dto.currentSalary,
      performanceRating: dto.performanceRating ?? null,
      rangeMidpoint: dto.rangeMidpoint ?? null,
      demographic: dto.demographic ?? null,
      status: MeritLineStatus.PENDING,
    }));
  }

  async listLines(tenantId: string, planId: string, budgetId?: string): Promise<MeritLine[]> {
    const where: any = { tenantId, planId };
    if (budgetId) where.budgetId = budgetId;
    return this.lineRepo.find({ where, order: { employeeName: 'ASC' } });
  }

  /**
   * Manager proposes an increment. Recomputes new salary + compa-ratio and
   * runs the alert engine (discretion breach vs the rating's grid band,
   * pay-range breach vs plan max compa-ratio, budget overrun on the node).
   */
  async proposeIncrement(
    tenantId: string, lineId: string, dto: { proposedPct: number },
  ): Promise<MeritLine> {
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException(`Merit line ${lineId} not found`);
    const plan = await this.getPlan(tenantId, line.planId);
    if (plan.status !== MeritPlanStatus.LAUNCHED) throw new BadRequestException('Increments can only be proposed on a LAUNCHED plan');
    const pct = Number(dto.proposedPct);
    if (!(pct >= 0)) throw new BadRequestException('proposedPct must be non-negative');

    line.proposedPct = round2(pct);
    line.proposedAmount = round2(Number(line.currentSalary) * pct / 100);
    line.newSalary = round2(Number(line.currentSalary) + line.proposedAmount);
    line.newCompaRatio = line.rangeMidpoint && Number(line.rangeMidpoint) > 0
      ? round2(line.newSalary / Number(line.rangeMidpoint))
      : null;
    line.alerts = await this.computeAlerts(plan, line);
    line.status = MeritLineStatus.PROPOSED;
    return this.lineRepo.save(line);
  }

  private async computeAlerts(plan: MeritPlan, line: MeritLine): Promise<Array<{ type: string; detail: string }>> {
    const alerts: Array<{ type: string; detail: string }> = [];

    // Discretion breach: proposed % outside the rating's configured band.
    if (line.performanceRating) {
      const band = plan.incrementRanges.find((r) => r.rating === line.performanceRating);
      if (band && (Number(line.proposedPct) < band.minPct || Number(line.proposedPct) > band.maxPct)) {
        alerts.push({
          type: 'DISCRETION_BREACH',
          detail: `${line.proposedPct}% is outside the ${line.performanceRating} band (${band.minPct}–${band.maxPct}%)`,
        });
      }
    }

    // Pay-range breach: new compa-ratio over the plan's max.
    if (plan.maxCompaRatio != null && line.newCompaRatio != null && Number(line.newCompaRatio) > Number(plan.maxCompaRatio)) {
      alerts.push({
        type: 'PAY_RANGE_BREACH',
        detail: `New compa-ratio ${line.newCompaRatio} exceeds the plan cap of ${plan.maxCompaRatio}`,
      });
    }

    // Budget overrun: node consumption over allocation once this line is counted.
    if (line.budgetId) {
      const node = await this.budgetRepo.findOne({ where: { id: line.budgetId, tenantId: plan.tenantId } });
      if (node) {
        const others = await this.lineRepo.find({ where: { tenantId: plan.tenantId, budgetId: line.budgetId } });
        const consumed = others
          .filter((l) => l.id !== line.id)
          .reduce((s, l) => s + Number(l.proposedAmount), 0) + Number(line.proposedAmount);
        if (consumed > Number(node.allocatedAmount)) {
          alerts.push({
            type: 'BUDGET_OVERRUN',
            detail: `Node "${node.name}" consumption ${round2(consumed)} exceeds its budget of ${node.allocatedAmount}`,
          });
        }
      }
    }
    return alerts;
  }

  /**
   * Bias screen across the plan: for each performance rating, compare the
   * average proposed % between demographic groups; flag gaps beyond
   * `thresholdPct` points as potential bias.
   */
  async biasScreen(tenantId: string, planId: string, thresholdPct = 2): Promise<Array<{
    rating: string; groups: Array<{ demographic: string; avgPct: number; count: number }>; gap: number; flagged: boolean;
  }>> {
    const lines = (await this.lineRepo.find({ where: { tenantId, planId } }))
      .filter((l) => l.status === MeritLineStatus.PROPOSED || l.status === MeritLineStatus.APPROVED);
    const byRating = new Map<string, Map<string, number[]>>();
    for (const l of lines) {
      if (!l.performanceRating || !l.demographic) continue;
      const groups = byRating.get(l.performanceRating) ?? new Map<string, number[]>();
      const arr = groups.get(l.demographic) ?? [];
      arr.push(Number(l.proposedPct));
      groups.set(l.demographic, arr);
      byRating.set(l.performanceRating, groups);
    }
    const result = [];
    for (const [rating, groups] of byRating) {
      const rows = Array.from(groups.entries()).map(([demographic, pcts]) => ({
        demographic,
        avgPct: round2(pcts.reduce((a, b) => a + b, 0) / pcts.length),
        count: pcts.length,
      }));
      if (rows.length < 2) continue;
      const gap = round2(Math.max(...rows.map((r) => r.avgPct)) - Math.min(...rows.map((r) => r.avgPct)));
      result.push({ rating, groups: rows, gap, flagged: gap > thresholdPct });
    }
    return result;
  }

  // ─── Approval & outputs ───────────────────────────────────────

  async approveLine(tenantId: string, lineId: string): Promise<MeritLine> {
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException(`Merit line ${lineId} not found`);
    if (line.status !== MeritLineStatus.PROPOSED) throw new BadRequestException('Only PROPOSED lines can be approved');
    line.status = MeritLineStatus.APPROVED;
    return this.lineRepo.save(line);
  }

  async rejectLine(tenantId: string, lineId: string): Promise<MeritLine> {
    const line = await this.lineRepo.findOne({ where: { id: lineId, tenantId } });
    if (!line) throw new NotFoundException(`Merit line ${lineId} not found`);
    line.status = MeritLineStatus.REJECTED;
    return this.lineRepo.save(line);
  }

  /**
   * Approve the plan once every proposed line has been actioned. Produces the
   * post-approval outputs: salary-structure updates and letter data per
   * approved employee. Emits merit.approved.
   */
  async approvePlan(tenantId: string, id: string): Promise<{ plan: MeritPlan; outputs: any[] }> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.LAUNCHED) throw new BadRequestException('Only LAUNCHED plans can be approved');
    const lines = await this.lineRepo.find({ where: { tenantId, planId: id } });
    const pending = lines.filter((l) => l.status === MeritLineStatus.PROPOSED);
    if (pending.length) throw new BadRequestException(`${pending.length} proposed line(s) still need approval or rejection`);

    plan.status = MeritPlanStatus.APPROVED;
    plan.approvedAt = new Date();
    const saved = await this.planRepo.save(plan);
    const outputs = this.buildOutputs(saved, lines.filter((l) => l.status === MeritLineStatus.APPROVED));

    // Handoff: draft an increment letter per approved employee through the
    // letters module. Best-effort — no MERIT_INCREMENT template (null) or a
    // failed render never blocks plan approval.
    if (this.letters) {
      for (const o of outputs) {
        const letter = await this.letters
          .generateByCode(tenantId, { code: 'MERIT_INCREMENT', employeeId: o.employeeId, data: o.letter.variables })
          .catch(() => null);
        if (letter) {
          o.letterId = letter.id;
          o.letterNumber = letter.letterNumber;
        }
      }
    }

    await this.automation?.emit(tenantId, 'merit.approved', {
      planId: saved.id, name: saved.name, awardedCount: outputs.length,
      totalAward: round2(outputs.reduce((s, o) => s + o.increaseAmount, 0)),
    });
    return { plan: saved, outputs };
  }

  private buildOutputs(plan: MeritPlan, approved: MeritLine[]): any[] {
    return approved.map((l) => ({
      employeeId: l.employeeId,
      employeeName: l.employeeName,
      currency: l.currency,
      previousSalary: Number(l.currentSalary),
      newSalary: Number(l.newSalary),
      increasePct: Number(l.proposedPct),
      increaseAmount: Number(l.proposedAmount),
      effectiveDate: plan.effectiveDate,
      // Letter payload the letters module can render.
      letter: {
        template: 'MERIT_INCREMENT',
        variables: {
          employeeName: l.employeeName,
          previousSalary: Number(l.currentSalary),
          newSalary: Number(l.newSalary),
          increasePct: Number(l.proposedPct),
          effectiveDate: plan.effectiveDate,
        },
      },
    }));
  }

  /** Read-only outputs preview for an approved plan. */
  async getOutputs(tenantId: string, id: string): Promise<any[]> {
    const plan = await this.getPlan(tenantId, id);
    if (plan.status !== MeritPlanStatus.APPROVED) throw new BadRequestException('Outputs are available once the plan is approved');
    const approved = await this.lineRepo.find({ where: { tenantId, planId: id, status: MeritLineStatus.APPROVED } });
    return this.buildOutputs(plan, approved);
  }
}
