import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AnalyticsLicense, AnalyticsTier, AnalyticsSeatPolicy, AnalyticsMetric,
  Storyboard, StoryboardStatus,
} from './entities/people-analytics.entity';
import { AutomationService } from '../../automation/automation.service';

const TIER_RANK: Record<AnalyticsTier, number> = {
  [AnalyticsTier.VIEWER]: 0,
  [AnalyticsTier.EXPLORER]: 1,
  [AnalyticsTier.CREATOR]: 2,
};

const VALID_AGG = new Set(['SUM', 'AVG', 'COUNT', 'MIN', 'MAX']);

@Injectable()
export class PeopleAnalyticsService {
  constructor(
    @InjectRepository(AnalyticsLicense) private readonly licenseRepo: Repository<AnalyticsLicense>,
    @InjectRepository(AnalyticsSeatPolicy) private readonly policyRepo: Repository<AnalyticsSeatPolicy>,
    @InjectRepository(AnalyticsMetric) private readonly metricRepo: Repository<AnalyticsMetric>,
    @InjectRepository(Storyboard) private readonly storyboardRepo: Repository<Storyboard>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Licences & seat limits ───────────────────────────────────

  async setSeatLimits(tenantId: string, limits: Partial<Record<AnalyticsTier, number | null>>): Promise<AnalyticsSeatPolicy> {
    let policy = await this.policyRepo.findOne({ where: { tenantId } });
    if (!policy) policy = this.policyRepo.create({ tenantId, limits: {} });
    policy.limits = limits ?? {};
    return this.policyRepo.save(policy);
  }

  async assignLicense(tenantId: string, userId: string, tier: AnalyticsTier, assignedByUserId?: string): Promise<AnalyticsLicense> {
    if (!Object.values(AnalyticsTier).includes(tier)) throw new BadRequestException('A valid tier is required');
    const policy = await this.policyRepo.findOne({ where: { tenantId } });
    const cap = policy?.limits?.[tier];
    let existing = await this.licenseRepo.findOne({ where: { tenantId, userId } });
    // Enforce the seat cap only when moving a user *into* a tier that would exceed it.
    if (cap != null && (!existing || existing.tier !== tier)) {
      const inTier = await this.licenseRepo.count({ where: { tenantId, tier } });
      if (inTier >= cap) throw new BadRequestException(`No ${tier} seats remaining (cap ${cap})`);
    }
    if (!existing) existing = this.licenseRepo.create({ tenantId, userId });
    existing.tier = tier;
    existing.assignedByUserId = assignedByUserId ?? existing.assignedByUserId ?? null;
    return this.licenseRepo.save(existing);
  }

  listLicenses(tenantId: string, tier?: AnalyticsTier): Promise<AnalyticsLicense[]> {
    const where: any = { tenantId };
    if (tier) where.tier = tier;
    return this.licenseRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async licenseSummary(tenantId: string): Promise<{ tier: AnalyticsTier; used: number; cap: number | null }[]> {
    const policy = await this.policyRepo.findOne({ where: { tenantId } });
    const out = [];
    for (const tier of Object.values(AnalyticsTier)) {
      out.push({ tier, used: await this.licenseRepo.count({ where: { tenantId, tier } }), cap: policy?.limits?.[tier] ?? null });
    }
    return out;
  }

  /** Throw unless the user holds at least `minTier`. */
  private async requireTier(tenantId: string, userId: string, minTier: AnalyticsTier): Promise<AnalyticsLicense> {
    const license = await this.licenseRepo.findOne({ where: { tenantId, userId } });
    if (!license || TIER_RANK[license.tier] < TIER_RANK[minTier]) {
      throw new ForbiddenException(`This action requires at least a ${minTier} analytics licence`);
    }
    return license;
  }

  // ─── Metric composer ──────────────────────────────────────────

  async createMetric(tenantId: string, userId: string, dto: { key: string; name: string; subjectAreaCode: string; measure: string; agg?: string; dimension?: string; filters?: any[]; format?: string }): Promise<AnalyticsMetric> {
    await this.requireTier(tenantId, userId, AnalyticsTier.EXPLORER);
    if (!dto.key?.trim() || !dto.measure?.trim() || !dto.subjectAreaCode?.trim()) {
      throw new BadRequestException('key, subjectAreaCode and measure are required');
    }
    const agg = (dto.agg ?? 'SUM').toUpperCase();
    if (!VALID_AGG.has(agg)) throw new BadRequestException(`agg must be one of ${[...VALID_AGG].join(', ')}`);
    const existing = await this.metricRepo.findOne({ where: { tenantId, key: dto.key.trim() } });
    if (existing) throw new BadRequestException(`Metric key "${dto.key}" already exists`);
    return this.metricRepo.save(this.metricRepo.create({
      tenantId, key: dto.key.trim(), name: dto.name?.trim() || dto.key.trim(),
      subjectAreaCode: dto.subjectAreaCode.trim(), measure: dto.measure.trim(), agg,
      dimension: dto.dimension ?? null, filters: dto.filters ?? [], format: dto.format ?? 'number',
      createdByUserId: userId,
    }));
  }

  listMetrics(tenantId: string): Promise<AnalyticsMetric[]> {
    return this.metricRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  /** Compute a composed metric over a supplied row set (semantic layer feeds the rows). */
  async computeMetric(tenantId: string, key: string, rows: any[]): Promise<{ key: string; value: number; format: string; byDimension?: Record<string, number> }> {
    const metric = await this.metricRepo.findOne({ where: { tenantId, key } });
    if (!metric) throw new NotFoundException(`Metric ${key} not found`);
    const filtered = (rows ?? []).filter((r) => metric.filters.every((f) => this.matches(r[f.field], f.op, f.value)));
    const agg = (vals: number[]) => this.aggregate(metric.agg, vals);
    const values = filtered.map((r) => Number(r[metric.measure])).filter((n) => Number.isFinite(n));
    const result: any = { key, value: agg(values), format: metric.format };
    if (metric.dimension) {
      const groups: Record<string, number[]> = {};
      for (const r of filtered) {
        const g = String(r[metric.dimension] ?? '—');
        const v = Number(r[metric.measure]);
        if (!Number.isFinite(v)) continue;
        (groups[g] ??= []).push(v);
      }
      result.byDimension = Object.fromEntries(Object.entries(groups).map(([g, vs]) => [g, agg(vs)]));
    }
    return result;
  }

  private aggregate(agg: string, vals: number[]): number {
    if (!vals.length) return agg === 'COUNT' ? 0 : 0;
    switch (agg) {
      case 'COUNT': return vals.length;
      case 'AVG': return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
      case 'MIN': return Math.min(...vals);
      case 'MAX': return Math.max(...vals);
      default: return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100; // SUM
    }
  }

  private matches(actual: any, op: string, expected: any): boolean {
    switch (op) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'gte': return Number(actual) >= Number(expected);
      case 'lte': return Number(actual) <= Number(expected);
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      default: return true;
    }
  }

  // ─── Storyboards ──────────────────────────────────────────────

  async createStoryboard(tenantId: string, userId: string, dto: { name: string; description?: string; slides?: any[] }): Promise<Storyboard> {
    await this.requireTier(tenantId, userId, AnalyticsTier.CREATOR);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.storyboardRepo.save(this.storyboardRepo.create({
      tenantId, name: dto.name.trim(), description: dto.description ?? null,
      slides: this.normaliseSlides(dto.slides ?? []), status: StoryboardStatus.DRAFT, ownerUserId: userId,
    }));
  }

  private normaliseSlides(slides: any[]): Storyboard['slides'] {
    return (slides ?? [])
      .filter((s) => s && s.title?.trim())
      .map((s) => ({ title: String(s.title).trim(), narrative: s.narrative, dashboardId: s.dashboardId, reportId: s.reportId, metricKeys: s.metricKeys }));
  }

  listStoryboards(tenantId: string, status?: StoryboardStatus): Promise<Storyboard[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.storyboardRepo.find({ where, order: { updatedAt: 'DESC' } });
  }

  async getStoryboard(tenantId: string, id: string): Promise<Storyboard> {
    const sb = await this.storyboardRepo.findOne({ where: { id, tenantId } });
    if (!sb) throw new NotFoundException(`Storyboard ${id} not found`);
    return sb;
  }

  async setSlides(tenantId: string, userId: string, id: string, slides: any[]): Promise<Storyboard> {
    await this.requireTier(tenantId, userId, AnalyticsTier.CREATOR);
    const sb = await this.getStoryboard(tenantId, id);
    if (sb.status === StoryboardStatus.PUBLISHED) throw new BadRequestException('Unpublish before editing a published storyboard');
    sb.slides = this.normaliseSlides(slides ?? []);
    return this.storyboardRepo.save(sb);
  }

  async publishStoryboard(tenantId: string, userId: string, id: string): Promise<Storyboard> {
    await this.requireTier(tenantId, userId, AnalyticsTier.CREATOR);
    const sb = await this.getStoryboard(tenantId, id);
    if (!sb.slides.length) throw new BadRequestException('Add at least one slide before publishing');
    sb.status = StoryboardStatus.PUBLISHED;
    sb.publishedAt = new Date();
    const saved = await this.storyboardRepo.save(sb);
    await this.automation?.emit(tenantId, 'analytics.storyboard_published', { storyboardId: saved.id, name: saved.name, slides: saved.slides.length });
    return saved;
  }

  async unpublishStoryboard(tenantId: string, userId: string, id: string): Promise<Storyboard> {
    await this.requireTier(tenantId, userId, AnalyticsTier.CREATOR);
    const sb = await this.getStoryboard(tenantId, id);
    sb.status = StoryboardStatus.DRAFT;
    return this.storyboardRepo.save(sb);
  }
}
