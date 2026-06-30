import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ForecastCategoryAssignment, ForecastCategory } from './entities/forecast-category.entity';
import { ForecastOverride } from './entities/forecast-override.entity';
import { ForecastSnapshot } from './entities/forecast-snapshot.entity';
import { CrmOpportunity, OpportunityStage } from '../entities/crm-opportunity.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** YYYY-Qn for a date string. */
export function quarterOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

const OPEN_STAGES = new Set<OpportunityStage>([
  OpportunityStage.QUALIFICATION, OpportunityStage.NEEDS_ANALYSIS, OpportunityStage.PROPOSAL, OpportunityStage.NEGOTIATION,
]);

@Injectable()
export class ForecastingService {
  constructor(
    @InjectRepository(ForecastCategoryAssignment) private readonly catRepo: Repository<ForecastCategoryAssignment>,
    @InjectRepository(ForecastOverride) private readonly overrideRepo: Repository<ForecastOverride>,
    @InjectRepository(ForecastSnapshot) private readonly snapRepo: Repository<ForecastSnapshot>,
    @InjectRepository(CrmOpportunity) private readonly oppRepo: Repository<CrmOpportunity>,
  ) {}

  // ─── Ph-214: forecast categories ──────────────────────────────────

  async assignCategory(tenantId: string, data: { opportunityId: string; category: ForecastCategory; period?: string }): Promise<ForecastCategoryAssignment> {
    const opp = await this.oppRepo.findOne({ where: { id: data.opportunityId, tenantId } });
    if (!opp) throw new NotFoundException('Opportunity not found');
    const period = data.period ?? (opp.expectedCloseDate ? quarterOf(opp.expectedCloseDate) : null);
    if (!period) throw new BadRequestException('period required (opportunity has no expected close date)');
    let row = await this.catRepo.findOne({ where: { tenantId, opportunityId: data.opportunityId, period } });
    if (row) {
      row.category = data.category;
      row.ownerId = opp.ownerId;
    } else {
      row = this.catRepo.create({ tenantId, opportunityId: data.opportunityId, ownerId: opp.ownerId, period, category: data.category } as any) as unknown as ForecastCategoryAssignment;
    }
    return (this.catRepo.save(row) as unknown) as Promise<ForecastCategoryAssignment>;
  }

  listCategories(tenantId: string, period: string): Promise<ForecastCategoryAssignment[]> {
    return this.catRepo.find({ where: { tenantId, period } });
  }

  // ─── Ph-215: manager roll-up + override ───────────────────────────

  /**
   * Roll up the forecast for a period by owner. commit = Σ COMMIT-category
   * value; bestCase = commit + Σ BEST_CASE; weightedPipeline = Σ open value ×
   * probability. Applies a manager override on commit where present.
   */
  async rollup(tenantId: string, period: string): Promise<any> {
    const opps = await this.oppRepo.find({ where: { tenantId } });
    const cats = await this.catRepo.find({ where: { tenantId, period } });
    const catOf = new Map(cats.map((c) => [c.opportunityId, c.category]));
    const overrides = await this.overrideRepo.find({ where: { tenantId, period } });
    const overrideOf = new Map(overrides.map((o) => [o.ownerId, o]));

    const byOwner = new Map<string, { ownerId: string; commit: number; bestCase: number; weightedPipeline: number; openCount: number }>();
    for (const o of opps) {
      const inPeriod = o.expectedCloseDate && quarterOf(o.expectedCloseDate) === period;
      if (!inPeriod) continue;
      const cat = catOf.get(o.id) ?? ForecastCategory.PIPELINE;
      if (cat === ForecastCategory.OMITTED) continue;
      const g = byOwner.get(o.ownerId) ?? { ownerId: o.ownerId, commit: 0, bestCase: 0, weightedPipeline: 0, openCount: 0 };
      const value = Number(o.value ?? 0);
      if (cat === ForecastCategory.COMMIT) { g.commit = round2(g.commit + value); g.bestCase = round2(g.bestCase + value); }
      else if (cat === ForecastCategory.BEST_CASE) { g.bestCase = round2(g.bestCase + value); }
      if (OPEN_STAGES.has(o.stage)) { g.weightedPipeline = round2(g.weightedPipeline + value * (Number(o.probability) / 100)); g.openCount++; }
      byOwner.set(o.ownerId, g);
    }
    const owners = [...byOwner.values()].map((g) => {
      const ov = overrideOf.get(g.ownerId);
      return { ...g, managerForecast: ov ? Number(ov.overrideAmount) : null, finalCommit: ov ? Number(ov.overrideAmount) : g.commit };
    });
    const teamCommit = round2(owners.reduce((s, o) => s + o.finalCommit, 0));
    const teamBestCase = round2(owners.reduce((s, o) => s + o.bestCase, 0));
    const teamPipeline = round2(owners.reduce((s, o) => s + o.weightedPipeline, 0));
    return { period, owners: owners.sort((a, b) => b.finalCommit - a.finalCommit), teamCommit, teamBestCase, teamWeightedPipeline: teamPipeline };
  }

  async setOverride(tenantId: string, data: { managerId: string; ownerId: string; period: string; overrideAmount: number; notes?: string }): Promise<ForecastOverride> {
    if (data.overrideAmount == null || data.overrideAmount < 0) throw new BadRequestException('overrideAmount must be >= 0');
    let row = await this.overrideRepo.findOne({ where: { tenantId, ownerId: data.ownerId, period: data.period } });
    if (row) {
      row.overrideAmount = data.overrideAmount; row.managerId = data.managerId; row.notes = data.notes ?? row.notes;
    } else {
      row = this.overrideRepo.create({ tenantId, managerId: data.managerId, ownerId: data.ownerId, period: data.period, overrideAmount: data.overrideAmount, notes: data.notes ?? null } as any) as unknown as ForecastOverride;
    }
    return (this.overrideRepo.save(row) as unknown) as Promise<ForecastOverride>;
  }

  // ─── Ph-216: accuracy & win rate ──────────────────────────────────

  /** Persist the current commit/best-case/pipeline per owner for the period. */
  async snapshot(tenantId: string, period: string, snapshotDate: string): Promise<{ saved: number }> {
    const roll = await this.rollup(tenantId, period);
    let saved = 0;
    for (const o of roll.owners) {
      const snap = this.snapRepo.create({
        tenantId, ownerId: o.ownerId, period, snapshotDate,
        commitAmount: o.finalCommit, bestCaseAmount: o.bestCase, pipelineAmount: o.weightedPipeline,
      } as any) as unknown as ForecastSnapshot;
      await this.snapRepo.save(snap);
      saved++;
    }
    return { saved };
  }

  /**
   * Forecast accuracy: the earliest snapshot's commit for the period vs actual
   * closed-won bookings in that period.
   */
  async accuracy(tenantId: string, period: string): Promise<any> {
    const snaps = await this.snapRepo.find({ where: { tenantId, period }, order: { snapshotDate: 'ASC' } });
    const opps = await this.oppRepo.find({ where: { tenantId } });
    const actual = round2(opps
      .filter((o) => o.stage === OpportunityStage.CLOSED_WON && o.expectedCloseDate && quarterOf(o.expectedCloseDate) === period)
      .reduce((s, o) => s + Number(o.value ?? 0), 0));
    // The earliest snapshot's total committed amount across owners.
    const firstDate = snaps.length ? snaps[0].snapshotDate : null;
    const firstCommit = firstDate
      ? round2(snaps.filter((x) => x.snapshotDate === firstDate).reduce((s, x) => s + Number(x.commitAmount), 0))
      : 0;
    const variance = round2(actual - firstCommit);
    const accuracyPct = firstCommit > 0 ? round2(100 - Math.abs(variance) / firstCommit * 100) : null;
    return { period, committed: firstCommit, actual, variance, accuracyPct };
  }

  /** Win rate overall and the open-pipeline distribution by stage. */
  async winRate(tenantId: string, period?: string): Promise<any> {
    const opps = await this.oppRepo.find({ where: { tenantId } });
    const inScope = period ? opps.filter((o) => o.expectedCloseDate && quarterOf(o.expectedCloseDate) === period) : opps;
    const won = inScope.filter((o) => o.stage === OpportunityStage.CLOSED_WON).length;
    const lost = inScope.filter((o) => o.stage === OpportunityStage.CLOSED_LOST).length;
    const winRatePct = won + lost > 0 ? round2((won / (won + lost)) * 100) : null;
    const byStage: Record<string, { count: number; value: number }> = {};
    for (const o of inScope) {
      const k = o.stage;
      byStage[k] = byStage[k] ?? { count: 0, value: 0 };
      byStage[k].count++;
      byStage[k].value = round2(byStage[k].value + Number(o.value ?? 0));
    }
    return { period: period ?? 'ALL', won, lost, winRatePct, byStage };
  }
}
