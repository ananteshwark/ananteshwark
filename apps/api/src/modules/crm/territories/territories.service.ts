import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Territory } from './entities/territory.entity';
import { Quota } from './entities/quota.entity';
import { CrmOpportunity, OpportunityStage } from '../entities/crm-opportunity.entity';
import { quarterOf } from '../forecasting/forecasting.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class TerritoriesService {
  constructor(
    @InjectRepository(Territory) private readonly terrRepo: Repository<Territory>,
    @InjectRepository(Quota) private readonly quotaRepo: Repository<Quota>,
    @InjectRepository(CrmOpportunity) private readonly oppRepo: Repository<CrmOpportunity>,
  ) {}

  // ─── Ph-217: territory definitions ────────────────────────────────

  listTerritories(tenantId: string): Promise<Territory[]> {
    return this.terrRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createTerritory(tenantId: string, data: { code: string; name: string; ownerId?: string; regions?: string[]; industries?: string[]; accountIds?: string[] }): Promise<Territory> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    const dup = await this.terrRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Territory code already exists');
    const t = this.terrRepo.create({
      tenantId, code: data.code, name: data.name, ownerId: data.ownerId ?? null,
      regions: data.regions ?? [], industries: data.industries ?? [], accountIds: data.accountIds ?? [], isActive: true,
    } as any) as unknown as Territory;
    return (this.terrRepo.save(t) as unknown) as Promise<Territory>;
  }

  /**
   * Find the best-matching active territory for an account: a named-account
   * match outranks an industry match, which outranks a region match.
   */
  async matchTerritory(tenantId: string, criteria: { accountId?: string; region?: string; industry?: string }): Promise<any> {
    const territories = (await this.terrRepo.find({ where: { tenantId } })).filter((t) => t.isActive);
    let best: { territory: Territory; score: number; reason: string } | null = null;
    for (const t of territories) {
      let score = 0; let reason = '';
      if (criteria.accountId && (t.accountIds ?? []).includes(criteria.accountId)) { score = 3; reason = 'NAMED_ACCOUNT'; }
      else if (criteria.industry && (t.industries ?? []).includes(criteria.industry)) { score = 2; reason = 'INDUSTRY'; }
      else if (criteria.region && (t.regions ?? []).includes(criteria.region)) { score = 1; reason = 'REGION'; }
      if (score > 0 && (!best || score > best.score)) best = { territory: t, score, reason };
    }
    return best ? { matched: true, territoryId: best.territory.id, code: best.territory.code, name: best.territory.name, ownerId: best.territory.ownerId, matchedBy: best.reason } : { matched: false };
  }

  // ─── Ph-218: quota assignment ─────────────────────────────────────

  async setQuota(tenantId: string, data: { repId: string; territoryId?: string; productFamily?: string; period: string; quotaAmount: number; currency?: string }): Promise<Quota> {
    if (!data.repId) throw new BadRequestException('repId is required');
    if (!/^\d{4}-Q[1-4]$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-Qn');
    if (data.quotaAmount == null || data.quotaAmount < 0) throw new BadRequestException('quotaAmount must be >= 0');
    const productFamily = data.productFamily ?? 'ALL';
    const territoryId = data.territoryId ?? null;
    let row = await this.quotaRepo.findOne({ where: { tenantId, repId: data.repId, territoryId, productFamily, period: data.period } as any });
    if (row) {
      row.quotaAmount = data.quotaAmount;
    } else {
      row = this.quotaRepo.create({
        tenantId, repId: data.repId, territoryId, productFamily, period: data.period,
        quotaAmount: data.quotaAmount, currency: data.currency ?? 'INR',
      } as any) as unknown as Quota;
    }
    return (this.quotaRepo.save(row) as unknown) as Promise<Quota>;
  }

  listQuotas(tenantId: string, period: string): Promise<Quota[]> {
    return this.quotaRepo.find({ where: { tenantId, period } });
  }

  // ─── Ph-219: attainment tracking ──────────────────────────────────

  /**
   * Quota attainment by rep for a period: closed-won bookings vs assigned quota.
   */
  async attainment(tenantId: string, period: string, repId?: string): Promise<any> {
    const quotaWhere: any = { tenantId, period };
    if (repId) quotaWhere.repId = repId;
    const quotas = await this.quotaRepo.find({ where: quotaWhere });
    const opps = await this.oppRepo.find({ where: { tenantId } });
    const wonByRep = new Map<string, number>();
    for (const o of opps) {
      if (o.stage !== OpportunityStage.CLOSED_WON) continue;
      if (!o.expectedCloseDate || quarterOf(o.expectedCloseDate) !== period) continue;
      if (repId && o.ownerId !== repId) continue;
      wonByRep.set(o.ownerId, round2((wonByRep.get(o.ownerId) ?? 0) + Number(o.value ?? 0)));
    }
    // Aggregate quota per rep (across territory/product-family rows).
    const quotaByRep = new Map<string, number>();
    for (const q of quotas) quotaByRep.set(q.repId, round2((quotaByRep.get(q.repId) ?? 0) + Number(q.quotaAmount)));

    const reps = new Set<string>([...quotaByRep.keys(), ...wonByRep.keys()]);
    const rows = [...reps].map((rep) => {
      const quota = quotaByRep.get(rep) ?? 0;
      const attained = wonByRep.get(rep) ?? 0;
      const pct = quota > 0 ? round2((attained / quota) * 100) : null;
      return { repId: rep, quota, attained, gap: round2(quota - attained), attainmentPct: pct };
    }).sort((a, b) => (b.attainmentPct ?? -1) - (a.attainmentPct ?? -1));

    const totalQuota = round2(rows.reduce((s, r) => s + r.quota, 0));
    const totalAttained = round2(rows.reduce((s, r) => s + r.attained, 0));
    return {
      period, totalQuota, totalAttained,
      teamAttainmentPct: totalQuota > 0 ? round2((totalAttained / totalQuota) * 100) : null,
      reps: rows,
    };
  }
}
