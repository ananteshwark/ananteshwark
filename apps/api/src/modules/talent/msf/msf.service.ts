import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MsfCampaign, MsfStatus, MsfRater, RaterStatus, MsfResponse, RaterRelationship,
} from './entities/msf-campaign.entity';
import { AutomationService } from '../../automation/automation.service';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

@Injectable()
export class MsfService {
  constructor(
    @InjectRepository(MsfCampaign) private readonly campaignRepo: Repository<MsfCampaign>,
    @InjectRepository(MsfRater) private readonly raterRepo: Repository<MsfRater>,
    @InjectRepository(MsfResponse) private readonly responseRepo: Repository<MsfResponse>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async createCampaign(tenantId: string, dto: { name: string; subjectEmployeeId: string; subjectName: string; competencies?: any[]; ratingScaleMax?: number; anonymityThreshold?: number; dueDate?: string }): Promise<MsfCampaign> {
    if (!dto.name?.trim() || !dto.subjectEmployeeId) throw new BadRequestException('name and subjectEmployeeId are required');
    const competencies = (dto.competencies ?? []).filter((c) => c.key?.trim());
    return this.campaignRepo.save(this.campaignRepo.create({
      tenantId, name: dto.name.trim(), subjectEmployeeId: dto.subjectEmployeeId, subjectName: dto.subjectName,
      competencies: competencies.map((c) => ({ key: c.key.trim(), label: c.label ?? c.key })),
      ratingScaleMax: dto.ratingScaleMax ?? 5, anonymityThreshold: dto.anonymityThreshold ?? 3,
      dueDate: dto.dueDate ?? null, status: MsfStatus.DRAFT,
    }));
  }

  listCampaigns(tenantId: string, status?: MsfStatus): Promise<MsfCampaign[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.campaignRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getCampaign(tenantId: string, id: string): Promise<MsfCampaign> {
    const c = await this.campaignRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException(`MSF campaign ${id} not found`);
    return c;
  }

  async addRater(tenantId: string, campaignId: string, dto: { raterEmployeeId: string; raterName?: string; relationship?: RaterRelationship }): Promise<MsfRater> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status === MsfStatus.CLOSED) throw new BadRequestException('Cannot add raters to a closed campaign');
    if (!dto.raterEmployeeId) throw new BadRequestException('raterEmployeeId is required');
    const existing = await this.raterRepo.findOne({ where: { tenantId, campaignId, raterEmployeeId: dto.raterEmployeeId } });
    if (existing) throw new BadRequestException('That rater is already on the campaign');
    return this.raterRepo.save(this.raterRepo.create({
      tenantId, campaignId, raterEmployeeId: dto.raterEmployeeId, raterName: dto.raterName ?? null,
      relationship: dto.relationship ?? RaterRelationship.PEER, status: RaterStatus.INVITED,
    }));
  }

  listRaters(tenantId: string, campaignId: string): Promise<MsfRater[]> {
    return this.raterRepo.find({ where: { tenantId, campaignId }, order: { relationship: 'ASC' } });
  }

  async launch(tenantId: string, campaignId: string): Promise<MsfCampaign> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status !== MsfStatus.DRAFT) throw new BadRequestException('Only DRAFT campaigns can launch');
    if (!campaign.competencies.length) throw new BadRequestException('Add competencies before launching');
    const raters = await this.raterRepo.find({ where: { tenantId, campaignId } });
    if (!raters.length) throw new BadRequestException('Add at least one rater before launching');
    campaign.status = MsfStatus.COLLECTING;
    return this.campaignRepo.save(campaign);
  }

  /** A rater submits their scored questionnaire. */
  async submitResponse(tenantId: string, raterId: string, dto: { ratings: Array<{ competencyKey: string; score: number }>; strengths?: string; improvements?: string }): Promise<MsfResponse> {
    const rater = await this.raterRepo.findOne({ where: { id: raterId, tenantId } });
    if (!rater) throw new NotFoundException(`Rater ${raterId} not found`);
    const campaign = await this.getCampaign(tenantId, rater.campaignId);
    if (campaign.status !== MsfStatus.COLLECTING) throw new BadRequestException('The campaign is not collecting responses');
    if (rater.status === RaterStatus.SUBMITTED) throw new BadRequestException('This rater has already submitted');

    const validKeys = new Set(campaign.competencies.map((c) => c.key));
    const ratings = (dto.ratings ?? []).filter((r) => validKeys.has(r.competencyKey));
    for (const r of ratings) {
      if (Number(r.score) < 1 || Number(r.score) > campaign.ratingScaleMax) {
        throw new BadRequestException(`score for ${r.competencyKey} must be between 1 and ${campaign.ratingScaleMax}`);
      }
    }
    const response = await this.responseRepo.save(this.responseRepo.create({
      tenantId, campaignId: rater.campaignId, raterId, relationship: rater.relationship,
      ratings, strengths: dto.strengths ?? null, improvements: dto.improvements ?? null,
    }));
    rater.status = RaterStatus.SUBMITTED;
    rater.submittedAt = new Date();
    await this.raterRepo.save(rater);
    return response;
  }

  async declineRater(tenantId: string, raterId: string): Promise<MsfRater> {
    const rater = await this.raterRepo.findOne({ where: { id: raterId, tenantId } });
    if (!rater) throw new NotFoundException(`Rater ${raterId} not found`);
    rater.status = RaterStatus.DECLINED;
    return this.raterRepo.save(rater);
  }

  async close(tenantId: string, campaignId: string): Promise<MsfCampaign> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (campaign.status !== MsfStatus.COLLECTING) throw new BadRequestException('Only collecting campaigns can be closed');
    campaign.status = MsfStatus.CLOSED;
    campaign.closedAt = new Date();
    const saved = await this.campaignRepo.save(campaign);
    const responses = await this.responseRepo.find({ where: { tenantId, campaignId } });
    await this.automation?.emit(tenantId, 'msf.closed', {
      campaignId, subjectEmployeeId: campaign.subjectEmployeeId, responses: responses.length,
    });
    return saved;
  }

  /**
   * Aggregate report per competency: overall average, self score, others'
   * average, and the self-vs-others gap (a positive gap = blind spot, a
   * negative gap = hidden strength). Per-relationship averages are suppressed
   * when a group has fewer than the anonymity threshold of raters (SELF exempt).
   */
  async report(tenantId: string, campaignId: string): Promise<{
    campaignId: string; subjectName: string; responseCount: number;
    competencies: Array<{
      key: string; label: string; overallAvg: number | null; selfScore: number | null;
      othersAvg: number | null; gap: number | null;
      byRelationship: Array<{ relationship: string; avg: number | null; raters: number; suppressed: boolean }>;
    }>;
    strengths: string[]; improvements: string[];
  }> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    const responses = await this.responseRepo.find({ where: { tenantId, campaignId } });

    const relationships = Object.values(RaterRelationship);
    const competencies = campaign.competencies.map((comp) => {
      const scoresFor = (rel?: RaterRelationship) => responses
        .filter((r) => (rel ? r.relationship === rel : true))
        .map((r) => r.ratings.find((x) => x.competencyKey === comp.key)?.score)
        .filter((s): s is number => typeof s === 'number');

      const avg = (arr: number[]) => (arr.length ? round2(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

      const selfScores = scoresFor(RaterRelationship.SELF);
      const selfScore = selfScores.length ? avg(selfScores) : null;
      const othersScores = responses
        .filter((r) => r.relationship !== RaterRelationship.SELF)
        .map((r) => r.ratings.find((x) => x.competencyKey === comp.key)?.score)
        .filter((s): s is number => typeof s === 'number');
      const othersAvg = avg(othersScores);

      const byRelationship = relationships.map((rel) => {
        const scores = scoresFor(rel);
        const raters = scores.length;
        const suppressed = rel !== RaterRelationship.SELF && raters > 0 && raters < campaign.anonymityThreshold;
        return { relationship: rel, avg: suppressed ? null : avg(scores), raters, suppressed };
      }).filter((r) => r.raters > 0);

      return {
        key: comp.key, label: comp.label,
        overallAvg: avg(scoresFor()),
        selfScore, othersAvg,
        gap: selfScore != null && othersAvg != null ? round2(selfScore - othersAvg) : null,
        byRelationship,
      };
    });

    return {
      campaignId, subjectName: campaign.subjectName, responseCount: responses.length,
      competencies,
      strengths: responses.map((r) => r.strengths).filter((s): s is string => !!s),
      improvements: responses.map((r) => r.improvements).filter((s): s is string => !!s),
    };
  }
}
