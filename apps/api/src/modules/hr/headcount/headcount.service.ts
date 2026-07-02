import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionBudget } from './entities/position-budget.entity';
import { WorkforceScenario, ScenarioStatus, ScenarioType } from './entities/workforce-scenario.entity';
import { Position } from '../employees/entities/position.entity';

@Injectable()
export class HeadcountService {
  constructor(
    @InjectRepository(PositionBudget) private readonly budgetRepo: Repository<PositionBudget>,
    @InjectRepository(WorkforceScenario) private readonly scenarioRepo: Repository<WorkforceScenario>,
    @InjectRepository(Position) private readonly positionRepo: Repository<Position>,
  ) {}

  // ─── Ph-191: position budgeting ───────────────────────────────────

  async updateBudget(tenantId: string, id: string, dto: any): Promise<PositionBudget> {
    const b = await this.budgetRepo.findOne({ where: { id, tenantId } });
    if (!b) throw new NotFoundException(`Budget ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(b, rest);
    return this.budgetRepo.save(b);
  }

  listBudgets(tenantId: string, fiscalYear?: number): Promise<PositionBudget[]> {
    const where: any = { tenantId };
    if (fiscalYear) where.fiscalYear = fiscalYear;
    return this.budgetRepo.find({ where, order: { fiscalYear: 'DESC' } });
  }

  async createBudget(tenantId: string, data: {
    positionId: string; fiscalYear: number; approvedFte: number; gradeId?: string;
    salaryMin?: number; salaryMax?: number; currency?: string; effectiveFrom?: string; effectiveTo?: string;
  }): Promise<PositionBudget> {
    const pos = await this.positionRepo.findOne({ where: { id: data.positionId, tenantId } });
    if (!pos) throw new NotFoundException(`Position ${data.positionId} not found`);
    if (data.approvedFte == null || data.approvedFte < 0) throw new BadRequestException('approvedFte must be >= 0');
    const sMin = data.salaryMin ?? 0;
    const sMax = data.salaryMax ?? 0;
    if (sMax && sMin && sMax < sMin) throw new BadRequestException('salaryMax must be >= salaryMin');
    const dup = await this.budgetRepo.findOne({ where: { tenantId, positionId: data.positionId, fiscalYear: data.fiscalYear } });
    if (dup) throw new BadRequestException('Budget already exists for this position + fiscal year');
    const b = this.budgetRepo.create({
      tenantId, positionId: data.positionId, fiscalYear: data.fiscalYear, approvedFte: data.approvedFte,
      gradeId: data.gradeId ?? pos.gradeId ?? null, salaryMin: sMin, salaryMax: sMax,
      currency: data.currency ?? 'USD', effectiveFrom: data.effectiveFrom ?? null, effectiveTo: data.effectiveTo ?? null,
    } as any) as unknown as PositionBudget;
    return (this.budgetRepo.save(b) as unknown) as Promise<PositionBudget>;
  }

  // ─── Ph-192: headcount control ────────────────────────────────────

  /**
   * Check whether adding `requestedFte` to a position stays within its approved
   * budget. Returns a severity: OK (within), WARN (no budget defined — falls
   * back to position.budgetedHeadcount), or BLOCK (would exceed approved FTE).
   */
  async checkHeadcount(tenantId: string, positionId: string, fiscalYear: number, requestedFte = 1): Promise<any> {
    const pos = await this.positionRepo.findOne({ where: { id: positionId, tenantId } });
    if (!pos) throw new NotFoundException(`Position ${positionId} not found`);
    const filled = Number(pos.filledHeadcount ?? 0);
    const budget = await this.budgetRepo.findOne({ where: { tenantId, positionId, fiscalYear } });
    const approved = budget ? Number(budget.approvedFte) : Number(pos.budgetedHeadcount ?? 0);
    const projected = filled + requestedFte;
    const remaining = approved - filled;
    let severity: 'OK' | 'WARN' | 'BLOCK' = 'OK';
    let message = `Within budget (${projected}/${approved} FTE)`;
    if (pos.status === 'FROZEN' || pos.status === 'CLOSED') {
      severity = 'BLOCK';
      message = `Position is ${pos.status}`;
    } else if (projected > approved) {
      severity = 'BLOCK';
      message = `Hire would exceed approved FTE (${projected}/${approved})`;
    } else if (!budget) {
      severity = 'WARN';
      message = `No fiscal-year budget defined; using position budgeted headcount ${approved}`;
    }
    return { positionId, fiscalYear, approvedFte: approved, filled, requestedFte, projected, remaining, severity, allowed: severity !== 'BLOCK', message, usedFallback: !budget };
  }

  /** Throws BadRequestException when a hire/transfer is blocked by headcount control. */
  async validateHire(tenantId: string, positionId: string, fiscalYear: number, requestedFte = 1): Promise<any> {
    const result = await this.checkHeadcount(tenantId, positionId, fiscalYear, requestedFte);
    if (result.severity === 'BLOCK') throw new BadRequestException(result.message);
    return result;
  }

  // ─── Ph-193: workforce planning scenarios ─────────────────────────

  listScenarios(tenantId: string): Promise<WorkforceScenario[]> {
    return this.scenarioRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createScenario(tenantId: string, data: { name: string; scenarioType?: ScenarioType; fiscalYear?: number; notes?: string }): Promise<WorkforceScenario> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    const s = this.scenarioRepo.create({
      tenantId, name: data.name, scenarioType: data.scenarioType ?? ScenarioType.RESTRUCTURE,
      status: ScenarioStatus.DRAFT, changes: [], fiscalYear: data.fiscalYear ?? null, notes: data.notes ?? null,
    } as any) as unknown as WorkforceScenario;
    return (this.scenarioRepo.save(s) as unknown) as Promise<WorkforceScenario>;
  }

  async addChange(tenantId: string, id: string, change: { positionId: string; action: string; deltaFte: number; note?: string }): Promise<WorkforceScenario> {
    const s = await this.getScenario(tenantId, id);
    if (s.status !== ScenarioStatus.DRAFT) throw new BadRequestException('Only DRAFT scenarios can be edited');
    if (!change.positionId) throw new BadRequestException('positionId required');
    s.changes = [...(s.changes ?? []), { positionId: change.positionId, action: change.action ?? 'ADJUST', deltaFte: Number(change.deltaFte) || 0, note: change.note }];
    return (this.scenarioRepo.save(s) as unknown) as Promise<WorkforceScenario>;
  }

  /**
   * Project a scenario against live baselines without mutating live data:
   * baseline FTE per affected position + the scenario's deltas.
   */
  async project(tenantId: string, id: string): Promise<any> {
    const s = await this.getScenario(tenantId, id);
    const positionIds = [...new Set((s.changes ?? []).map((c) => c.positionId))];
    const positions = positionIds.length
      ? await this.positionRepo.find({ where: positionIds.map((pid) => ({ id: pid, tenantId })) })
      : [];
    const posById = new Map(positions.map((p) => [p.id, p]));
    let baselineTotal = 0;
    let projectedTotal = 0;
    const lines = positionIds.map((pid) => {
      const p = posById.get(pid);
      const baseline = Number(p?.filledHeadcount ?? 0);
      const delta = (s.changes ?? []).filter((c) => c.positionId === pid).reduce((sum, c) => sum + (Number(c.deltaFte) || 0), 0);
      const projected = Math.max(0, baseline + delta);
      baselineTotal += baseline;
      projectedTotal += projected;
      return { positionId: pid, title: p?.title ?? null, baseline, delta, projected };
    });
    return {
      scenarioId: s.id, name: s.name, scenarioType: s.scenarioType, status: s.status,
      baselineTotal, projectedTotal, netChange: projectedTotal - baselineTotal, lines,
    };
  }

  async finalize(tenantId: string, id: string): Promise<WorkforceScenario> {
    const s = await this.getScenario(tenantId, id);
    if (s.status !== ScenarioStatus.DRAFT) throw new BadRequestException('Only DRAFT scenarios can be finalized');
    s.status = ScenarioStatus.FINALIZED;
    return (this.scenarioRepo.save(s) as unknown) as Promise<WorkforceScenario>;
  }

  async discard(tenantId: string, id: string): Promise<WorkforceScenario> {
    const s = await this.getScenario(tenantId, id);
    s.status = ScenarioStatus.DISCARDED;
    return (this.scenarioRepo.save(s) as unknown) as Promise<WorkforceScenario>;
  }

  private async getScenario(tenantId: string, id: string): Promise<WorkforceScenario> {
    const s = await this.scenarioRepo.findOne({ where: { id, tenantId } });
    if (!s) throw new NotFoundException(`Scenario ${id} not found`);
    return s;
  }
}
