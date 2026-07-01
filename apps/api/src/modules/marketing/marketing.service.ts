import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Campaign, CampaignChannel, CampaignStatus } from './entities/campaign.entity';
import { CampaignMember, MemberStatus } from './entities/campaign-member.entity';
import { LeadScore } from './entities/lead-score.entity';
import { NurtureFlow } from './entities/nurture-flow.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Behavior → score points. */
const BEHAVIOR_POINTS: Record<string, number> = {
  EMAIL_OPEN: 5,
  EMAIL_CLICK: 10,
  PAGE_VISIT: 3,
  FORM_FILL: 20,
  DEMO_REQUEST: 30,
  UNSUBSCRIBE: -50,
};

function gradeFor(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 50) return 'B';
  if (score >= 20) return 'C';
  return 'D';
}

@Injectable()
export class MarketingService {
  constructor(
    @InjectRepository(Campaign) private readonly campaignRepo: Repository<Campaign>,
    @InjectRepository(CampaignMember) private readonly memberRepo: Repository<CampaignMember>,
    @InjectRepository(LeadScore) private readonly scoreRepo: Repository<LeadScore>,
    @InjectRepository(NurtureFlow) private readonly flowRepo: Repository<NurtureFlow>,
  ) {}

  // ─── Ph-233: campaign management ──────────────────────────────────

  listCampaigns(tenantId: string): Promise<Campaign[]> {
    return this.campaignRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createCampaign(tenantId: string, data: { name: string; channel?: CampaignChannel; content?: string; cost?: number; currency?: string }): Promise<Campaign> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    const c = this.campaignRepo.create({
      tenantId, name: data.name, channel: data.channel ?? CampaignChannel.EMAIL, status: CampaignStatus.DRAFT,
      content: data.content ?? null, cost: data.cost ?? 0, currency: data.currency ?? 'INR', scheduledAt: null, sentAt: null,
    } as any) as unknown as Campaign;
    return (this.campaignRepo.save(c) as unknown) as Promise<Campaign>;
  }

  async addMembers(tenantId: string, campaignId: string, leadIds: string[]): Promise<{ added: number }> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status === CampaignStatus.SENT) throw new BadRequestException('Cannot add members to a sent campaign');
    if (!leadIds?.length) throw new BadRequestException('leadIds required');
    const existing = await this.memberRepo.find({ where: { tenantId, campaignId, leadId: In(leadIds) } });
    const existingIds = new Set(existing.map((m) => m.leadId));
    let added = 0;
    for (const leadId of leadIds) {
      if (existingIds.has(leadId)) continue;
      const m = this.memberRepo.create({ tenantId, campaignId, leadId, status: MemberStatus.PENDING, convertedValue: 0, opportunityId: null } as any) as unknown as CampaignMember;
      await this.memberRepo.save(m);
      added++;
    }
    return { added };
  }

  async scheduleCampaign(tenantId: string, id: string, scheduledAt: string): Promise<Campaign> {
    const c = await this.getCampaign(tenantId, id);
    if (c.status !== CampaignStatus.DRAFT) throw new BadRequestException('Only DRAFT campaigns can be scheduled');
    const members = await this.memberRepo.count({ where: { tenantId, campaignId: id } });
    if (members === 0) throw new BadRequestException('Add members before scheduling');
    c.status = CampaignStatus.SCHEDULED;
    c.scheduledAt = new Date(scheduledAt);
    return (this.campaignRepo.save(c) as unknown) as Promise<Campaign>;
  }

  /** Send the campaign: mark all pending members SENT. */
  async sendCampaign(tenantId: string, id: string, sentAt: string): Promise<any> {
    const c = await this.getCampaign(tenantId, id);
    if (c.status === CampaignStatus.SENT) throw new BadRequestException('Campaign already sent');
    if (c.status === CampaignStatus.CANCELLED) throw new BadRequestException('Campaign is cancelled');
    const members = await this.memberRepo.find({ where: { tenantId, campaignId: id } });
    if (members.length === 0) throw new BadRequestException('No members to send to');
    let sent = 0;
    for (const m of members) {
      if (m.status === MemberStatus.PENDING) { m.status = MemberStatus.SENT; await this.memberRepo.save(m); sent++; }
    }
    c.status = CampaignStatus.SENT;
    c.sentAt = new Date(sentAt);
    await this.campaignRepo.save(c);
    return { campaignId: id, sent, totalMembers: members.length };
  }

  /** Record an engagement event on a member (open/click/bounce). */
  async recordEngagement(tenantId: string, memberId: string, event: 'OPEN' | 'CLICK' | 'BOUNCE'): Promise<CampaignMember> {
    const m = await this.memberRepo.findOne({ where: { id: memberId, tenantId } });
    if (!m) throw new NotFoundException('Campaign member not found');
    const map: Record<string, MemberStatus> = { OPEN: MemberStatus.OPENED, CLICK: MemberStatus.CLICKED, BOUNCE: MemberStatus.BOUNCED };
    m.status = map[event];
    return (this.memberRepo.save(m) as unknown) as Promise<CampaignMember>;
  }

  async campaignStats(tenantId: string, id: string): Promise<any> {
    const members = await this.memberRepo.find({ where: { tenantId, campaignId: id } });
    const by = (s: MemberStatus) => members.filter((m) => m.status === s).length;
    const sent = members.filter((m) => m.status !== MemberStatus.PENDING).length;
    const opened = by(MemberStatus.OPENED) + by(MemberStatus.CLICKED) + by(MemberStatus.CONVERTED);
    const clicked = by(MemberStatus.CLICKED) + by(MemberStatus.CONVERTED);
    return {
      campaignId: id, total: members.length, sent,
      opened, clicked, bounced: by(MemberStatus.BOUNCED), converted: by(MemberStatus.CONVERTED),
      openRate: sent > 0 ? round2((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? round2((clicked / sent) * 100) : 0,
    };
  }

  // ─── Ph-234: lead scoring ─────────────────────────────────────────

  /** Record a behavior for a lead; updates the weighted score and grade. */
  async recordBehavior(tenantId: string, leadId: string, behavior: string, at: string): Promise<LeadScore> {
    const points = BEHAVIOR_POINTS[behavior];
    if (points == null) throw new BadRequestException(`Unknown behavior "${behavior}"`);
    let row = await this.scoreRepo.findOne({ where: { tenantId, leadId } });
    if (!row) {
      row = this.scoreRepo.create({ tenantId, leadId, score: 0, grade: 'D', behaviors: [], lastActivityAt: null } as any) as unknown as LeadScore;
    }
    row.score = Math.max(0, row.score + points);
    row.grade = gradeFor(row.score);
    row.behaviors = [...(row.behaviors ?? []), { behavior, points, at }];
    row.lastActivityAt = new Date(at);
    return (this.scoreRepo.save(row) as unknown) as Promise<LeadScore>;
  }

  getScore(tenantId: string, leadId: string): Promise<LeadScore | null> {
    return this.scoreRepo.findOne({ where: { tenantId, leadId } });
  }

  async topLeads(tenantId: string, limit = 20): Promise<LeadScore[]> {
    const all = await this.scoreRepo.find({ where: { tenantId }, order: { score: 'DESC' } });
    return all.slice(0, limit);
  }

  // ─── Ph-235: nurture flows ────────────────────────────────────────

  listFlows(tenantId: string): Promise<NurtureFlow[]> {
    return this.flowRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createFlow(tenantId: string, data: { name: string; triggerBehavior: string; steps: any[] }): Promise<NurtureFlow> {
    if (!data.name?.trim() || !data.triggerBehavior?.trim()) throw new BadRequestException('name and triggerBehavior are required');
    if (!data.steps?.length) throw new BadRequestException('at least one step is required');
    const steps = [...data.steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const f = this.flowRepo.create({ tenantId, name: data.name, triggerBehavior: data.triggerBehavior, steps, isActive: true } as any) as unknown as NurtureFlow;
    return (this.flowRepo.save(f) as unknown) as Promise<NurtureFlow>;
  }

  /**
   * Trigger nurture flows matching a behavior: return the scheduled steps with
   * their due dates computed from `startDate` + each step's delayDays.
   */
  async triggerFlows(tenantId: string, behavior: string, leadId: string, startDate: string): Promise<any> {
    const flows = (await this.flowRepo.find({ where: { tenantId, triggerBehavior: behavior, isActive: true } }));
    const base = new Date(startDate).getTime();
    const scheduled = flows.map((f) => ({
      flowId: f.id, flowName: f.name,
      steps: (f.steps ?? []).map((s) => ({
        order: s.order, action: s.action, templateRef: s.templateRef ?? null,
        dueDate: new Date(base + (Number(s.delayDays) || 0) * 86400000).toISOString().slice(0, 10),
      })),
    }));
    return { leadId, behavior, triggeredFlows: scheduled.length, scheduled };
  }

  // ─── Ph-236: marketing attribution ────────────────────────────────

  /** Record a conversion on a campaign member (attributes revenue to campaign). */
  async recordConversion(tenantId: string, memberId: string, opportunityId: string, value: number): Promise<CampaignMember> {
    const m = await this.memberRepo.findOne({ where: { id: memberId, tenantId } });
    if (!m) throw new NotFoundException('Campaign member not found');
    if (value < 0) throw new BadRequestException('value must be >= 0');
    m.status = MemberStatus.CONVERTED;
    m.opportunityId = opportunityId;
    m.convertedValue = round2(value);
    return (this.memberRepo.save(m) as unknown) as Promise<CampaignMember>;
  }

  /** Campaign ROI: attributed revenue vs cost. */
  async campaignRoi(tenantId: string, campaignId: string): Promise<any> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    const members = await this.memberRepo.find({ where: { tenantId, campaignId } });
    const conversions = members.filter((m) => m.status === MemberStatus.CONVERTED);
    const revenue = round2(conversions.reduce((s, m) => s + Number(m.convertedValue), 0));
    const cost = Number(campaign.cost);
    const roi = cost > 0 ? round2(((revenue - cost) / cost) * 100) : null;
    return {
      campaignId, campaignName: campaign.name, cost, revenue,
      conversions: conversions.length, members: members.length,
      conversionRate: members.length > 0 ? round2((conversions.length / members.length) * 100) : 0,
      roiPct: roi,
    };
  }

  private async getCampaign(tenantId: string, id: string): Promise<Campaign> {
    const c = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`Campaign ${id} not found`);
    return c;
  }
}
