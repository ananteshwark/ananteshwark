import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationQualityPlan } from './entities/operation-quality-plan.entity';
import { OperationQualityResult, QualityVerdict } from './entities/operation-quality-result.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CollectionResult {
  results: Array<{ characteristicName: string; measuredValue: number | null; verdict: QualityVerdict; required: boolean }>;
  allPassed: boolean;
  canProceed: boolean; // false when a required, block-on-fail characteristic failed
  blockedBy: string[];
}

@Injectable()
export class OpQualityService {
  constructor(
    @InjectRepository(OperationQualityPlan) private readonly planRepo: Repository<OperationQualityPlan>,
    @InjectRepository(OperationQualityResult) private readonly resultRepo: Repository<OperationQualityResult>,
  ) {}

  // ─── Ph-155: plans per operation ──────────────────────────────────

  listPlans(tenantId: string, routingOperationId?: string): Promise<OperationQualityPlan[]> {
    const where: any = { tenantId };
    if (routingOperationId) where.routingOperationId = routingOperationId;
    return this.planRepo.find({ where, order: { createdAt: 'ASC' } });
  }

  async updatePlan(tenantId: string, id: string, dto: any): Promise<OperationQualityPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    const { tenantId: _t, id: _i, ...rest } = dto ?? {};
    Object.assign(plan, rest);
    return this.planRepo.save(plan);
  }

  async createPlan(tenantId: string, data: {
    routingOperationId: string; characteristicName: string; specMin?: number; specMax?: number;
    uom?: string; isRequired?: boolean; blockOnFail?: boolean;
  }): Promise<OperationQualityPlan> {
    if (!data.routingOperationId || !data.characteristicName) {
      throw new BadRequestException('routingOperationId and characteristicName are required');
    }
    const plan = this.planRepo.create({
      tenantId,
      routingOperationId: data.routingOperationId,
      characteristicName: data.characteristicName,
      specMin: data.specMin ?? null,
      specMax: data.specMax ?? null,
      uom: data.uom ?? null,
      isRequired: data.isRequired !== false,
      blockOnFail: data.blockOnFail !== false,
      isActive: true,
    } as any) as unknown as OperationQualityPlan;
    return (this.planRepo.save(plan) as unknown) as Promise<OperationQualityPlan>;
  }

  async deletePlan(tenantId: string, id: string): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Plan ${id} not found`);
    await this.planRepo.remove(plan);
  }

  // ─── Ph-156: in-process collection ────────────────────────────────

  /** Evaluate a measurement against a spec window. */
  evaluate(plan: OperationQualityPlan, value: number | null): QualityVerdict {
    if (value == null) return QualityVerdict.FAIL;
    if (plan.specMin != null && value < Number(plan.specMin)) return QualityVerdict.FAIL;
    if (plan.specMax != null && value > Number(plan.specMax)) return QualityVerdict.FAIL;
    return QualityVerdict.PASS;
  }

  /**
   * Collect measurements at an operation. Each measured characteristic is
   * evaluated against its plan; required + block-on-fail failures block the move.
   */
  async collect(tenantId: string, data: {
    productionOrderId: string; routingOperationId: string; workCenterId?: string; itemId?: string;
    measurements: Array<{ characteristicName: string; measuredValue: number | null }>;
    recordedById?: string;
  }): Promise<CollectionResult> {
    const plans = await this.planRepo.find({
      where: { tenantId, routingOperationId: data.routingOperationId, isActive: true },
    });
    if (plans.length === 0) throw new BadRequestException('No quality plan defined for this operation');

    // attempt number = existing distinct attempts + 1
    const prior = await this.resultRepo.find({
      where: { tenantId, productionOrderId: data.productionOrderId, routingOperationId: data.routingOperationId },
    });
    const attemptNumber = prior.length > 0 ? Math.max(...prior.map((r) => r.attemptNumber)) + 1 : 1;

    const out: CollectionResult = { results: [], allPassed: true, canProceed: true, blockedBy: [] };
    for (const plan of plans) {
      const m = data.measurements.find((x) => x.characteristicName === plan.characteristicName);
      const value = m ? m.measuredValue : null;
      const verdict = this.evaluate(plan, value);
      if (verdict === QualityVerdict.FAIL) {
        out.allPassed = false;
        if (plan.isRequired && plan.blockOnFail) {
          out.canProceed = false;
          out.blockedBy.push(plan.characteristicName);
        }
      }
      out.results.push({ characteristicName: plan.characteristicName, measuredValue: value, verdict, required: plan.isRequired });
      await this.resultRepo.save(this.resultRepo.create({
        tenantId,
        productionOrderId: data.productionOrderId,
        routingOperationId: data.routingOperationId,
        workCenterId: data.workCenterId ?? null,
        itemId: data.itemId ?? null,
        characteristicName: plan.characteristicName,
        measuredValue: value,
        verdict,
        attemptNumber,
        recordedById: data.recordedById ?? null,
      } as any));
    }
    return out;
  }

  /** Whether the latest collection at an operation permits moving on. */
  async canProceed(tenantId: string, productionOrderId: string, routingOperationId: string): Promise<{ canProceed: boolean; reason: string }> {
    const plans = await this.planRepo.find({ where: { tenantId, routingOperationId, isActive: true } });
    const requiredBlocking = plans.filter((p) => p.isRequired && p.blockOnFail);
    if (requiredBlocking.length === 0) return { canProceed: true, reason: 'No blocking quality requirements' };

    const results = await this.resultRepo.find({ where: { tenantId, productionOrderId, routingOperationId } });
    if (results.length === 0) return { canProceed: false, reason: 'Quality not yet collected for this operation' };
    const latestAttempt = Math.max(...results.map((r) => r.attemptNumber));
    const latest = results.filter((r) => r.attemptNumber === latestAttempt);

    for (const p of requiredBlocking) {
      const r = latest.find((x) => x.characteristicName === p.characteristicName);
      if (!r || r.verdict === QualityVerdict.FAIL) {
        return { canProceed: false, reason: `Required characteristic "${p.characteristicName}" not passing` };
      }
    }
    return { canProceed: true, reason: 'All required characteristics passed' };
  }

  // ─── Ph-158: first-pass yield ─────────────────────────────────────

  /**
   * First-pass yield = operations whose first attempt passed every characteristic
   * / total operations attempted. Grouped by work center.
   */
  async firstPassYield(tenantId: string, params: { workCenterId?: string; itemId?: string } = {}): Promise<any> {
    const where: any = { tenantId };
    if (params.workCenterId) where.workCenterId = params.workCenterId;
    if (params.itemId) where.itemId = params.itemId;
    const results = await this.resultRepo.find({ where });

    // group by (productionOrderId, routingOperationId)
    const groups = new Map<string, OperationQualityResult[]>();
    for (const r of results) {
      const key = `${r.productionOrderId}|${r.routingOperationId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    let firstPass = 0;
    let total = 0;
    const byWorkCenter = new Map<string, { firstPass: number; total: number }>();
    for (const rs of groups.values()) {
      total++;
      const firstAttempt = rs.filter((r) => r.attemptNumber === 1);
      const passedFirst = firstAttempt.length > 0 && firstAttempt.every((r) => r.verdict === QualityVerdict.PASS);
      if (passedFirst) firstPass++;
      const wc = rs[0].workCenterId ?? 'UNKNOWN';
      const e = byWorkCenter.get(wc) ?? { firstPass: 0, total: 0 };
      e.total++;
      if (passedFirst) e.firstPass++;
      byWorkCenter.set(wc, e);
    }

    return {
      firstPassYieldPct: total > 0 ? round2((firstPass / total) * 100) : 0,
      operationsPassedFirst: firstPass,
      operationsTotal: total,
      byWorkCenter: [...byWorkCenter.entries()].map(([workCenterId, v]) => ({
        workCenterId,
        firstPassYieldPct: v.total > 0 ? round2((v.firstPass / v.total) * 100) : 0,
        ...v,
      })),
    };
  }

  async listResults(tenantId: string, productionOrderId: string): Promise<OperationQualityResult[]> {
    return this.resultRepo.find({ where: { tenantId, productionOrderId }, order: { createdAt: 'DESC' } });
  }
}
