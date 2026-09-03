import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobFamily, CareerLadder, CareerPath, CareerPathType } from './entities/career-architecture.entity';
import { TalentPool, TalentPoolMember, TalentPoolType, PoolMemberStatus } from './entities/talent-pool.entity';
import { TalentReview, TalentReviewStatus, NineBoxPlacement, Rating3 } from './entities/talent-review.entity';
import { AutomationService } from '../../automation/automation.service';

const RATING_SCORE: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

// 9-box labels keyed by derived box number (9 = high perf & high potential).
const BOX_LABELS: Record<number, string> = {
  9: 'Star',
  8: 'High Potential',
  7: 'Rough Diamond',
  6: 'High Performer',
  5: 'Core Player',
  4: 'Inconsistent Player',
  3: 'Trusted Professional',
  2: 'Effective',
  1: 'Underperformer',
};

@Injectable()
export class CareerService {
  constructor(
    @InjectRepository(JobFamily) private readonly familyRepo: Repository<JobFamily>,
    @InjectRepository(CareerLadder) private readonly ladderRepo: Repository<CareerLadder>,
    @InjectRepository(CareerPath) private readonly pathRepo: Repository<CareerPath>,
    @InjectRepository(TalentPool) private readonly poolRepo: Repository<TalentPool>,
    @InjectRepository(TalentPoolMember) private readonly memberRepo: Repository<TalentPoolMember>,
    @InjectRepository(TalentReview) private readonly reviewRepo: Repository<TalentReview>,
    @InjectRepository(NineBoxPlacement) private readonly placementRepo: Repository<NineBoxPlacement>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  /** Derive the 9-box number + label from a performance/potential pair. */
  static computeBox(performance: Rating3, potential: Rating3): { box: number; boxLabel: string } {
    const box = RATING_SCORE[potential] * 3 + RATING_SCORE[performance] + 1;
    return { box, boxLabel: BOX_LABELS[box] ?? 'Core Player' };
  }

  // ─── Career architecture: job families ────────────────────────

  async createJobFamily(tenantId: string, dto: { code: string; name: string; functionArea?: string; description?: string }): Promise<JobFamily> {
    if (!dto.code?.trim() || !dto.name?.trim()) throw new BadRequestException('code and name are required');
    const existing = await this.familyRepo.findOne({ where: { tenantId, code: dto.code.trim() } });
    if (existing) throw new BadRequestException(`Job family code "${dto.code}" already exists`);
    return this.familyRepo.save(this.familyRepo.create({
      tenantId, code: dto.code.trim(), name: dto.name.trim(),
      functionArea: dto.functionArea ?? null, description: dto.description ?? null, active: true,
    }));
  }

  listJobFamilies(tenantId: string): Promise<JobFamily[]> {
    return this.familyRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async updateJobFamily(tenantId: string, id: string, dto: Partial<JobFamily>): Promise<JobFamily> {
    const family = await this.familyRepo.findOne({ where: { id, tenantId } });
    if (!family) throw new NotFoundException(`Job family ${id} not found`);
    Object.assign(family, { name: dto.name ?? family.name, functionArea: dto.functionArea ?? family.functionArea, description: dto.description ?? family.description, active: dto.active ?? family.active });
    return this.familyRepo.save(family);
  }

  // ─── Career architecture: ladders ─────────────────────────────

  async createLadder(tenantId: string, dto: { jobFamilyId: string; name: string; track?: string; rungs?: any[] }): Promise<CareerLadder> {
    const family = await this.familyRepo.findOne({ where: { id: dto.jobFamilyId, tenantId } });
    if (!family) throw new NotFoundException(`Job family ${dto.jobFamilyId} not found`);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.ladderRepo.save(this.ladderRepo.create({
      tenantId, jobFamilyId: dto.jobFamilyId, name: dto.name.trim(),
      track: dto.track ?? 'IC', rungs: this.normaliseRungs(dto.rungs ?? []), active: true,
    }));
  }

  listLadders(tenantId: string, jobFamilyId?: string): Promise<CareerLadder[]> {
    const where: any = { tenantId };
    if (jobFamilyId) where.jobFamilyId = jobFamilyId;
    return this.ladderRepo.find({ where, order: { name: 'ASC' } });
  }

  async setLadderRungs(tenantId: string, id: string, rungs: any[]): Promise<CareerLadder> {
    const ladder = await this.ladderRepo.findOne({ where: { id, tenantId } });
    if (!ladder) throw new NotFoundException(`Career ladder ${id} not found`);
    ladder.rungs = this.normaliseRungs(rungs ?? []);
    return this.ladderRepo.save(ladder);
  }

  private normaliseRungs(rungs: any[]): Array<{ level: number; title: string; grade?: string; minYears?: number; competencies?: string[] }> {
    return (rungs ?? [])
      .filter((r) => r && r.title?.trim())
      .map((r) => ({ level: Number(r.level), title: String(r.title).trim(), grade: r.grade, minYears: r.minYears != null ? Number(r.minYears) : undefined, competencies: r.competencies }))
      .sort((a, b) => a.level - b.level);
  }

  // ─── Career architecture: paths ───────────────────────────────

  async createPath(tenantId: string, dto: { fromLadderId: string; fromLevel: number; toLadderId: string; toLevel: number; pathType?: CareerPathType; typicalDurationMonths?: number; readinessCriteria?: any[] }): Promise<CareerPath> {
    const [from, to] = await Promise.all([
      this.ladderRepo.findOne({ where: { id: dto.fromLadderId, tenantId } }),
      this.ladderRepo.findOne({ where: { id: dto.toLadderId, tenantId } }),
    ]);
    if (!from || !to) throw new NotFoundException('Both from and to ladders must exist');
    return this.pathRepo.save(this.pathRepo.create({
      tenantId, fromLadderId: dto.fromLadderId, fromLevel: Number(dto.fromLevel),
      toLadderId: dto.toLadderId, toLevel: Number(dto.toLevel),
      pathType: dto.pathType ?? CareerPathType.VERTICAL,
      typicalDurationMonths: dto.typicalDurationMonths ?? null,
      readinessCriteria: dto.readinessCriteria ?? [],
    }));
  }

  /** Reachable next moves from a given ladder + level, resolved to target titles. */
  async nextMoves(tenantId: string, ladderId: string, level: number): Promise<Array<{
    path: CareerPath; toLadderName: string; toTitle: string;
  }>> {
    const paths = await this.pathRepo.find({ where: { tenantId, fromLadderId: ladderId, fromLevel: Number(level) } });
    const out = [];
    for (const p of paths) {
      const toLadder = await this.ladderRepo.findOne({ where: { id: p.toLadderId, tenantId } });
      const rung = toLadder?.rungs.find((r) => r.level === p.toLevel);
      out.push({ path: p, toLadderName: toLadder?.name ?? 'Unknown', toTitle: rung?.title ?? `Level ${p.toLevel}` });
    }
    return out;
  }

  // ─── Talent pools ─────────────────────────────────────────────

  async createPool(tenantId: string, dto: { name: string; type?: TalentPoolType; description?: string; ownerUserId?: string; targetSize?: number; criteria?: any[] }): Promise<TalentPool> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.poolRepo.save(this.poolRepo.create({
      tenantId, name: dto.name.trim(), type: dto.type ?? TalentPoolType.HIPO,
      description: dto.description ?? null, ownerUserId: dto.ownerUserId ?? null,
      targetSize: dto.targetSize ?? null, criteria: dto.criteria ?? [], active: true,
    }));
  }

  listPools(tenantId: string, type?: TalentPoolType): Promise<TalentPool[]> {
    const where: any = { tenantId };
    if (type) where.type = type;
    return this.poolRepo.find({ where, order: { name: 'ASC' } });
  }

  async getPool(tenantId: string, id: string): Promise<TalentPool> {
    const pool = await this.poolRepo.findOne({ where: { id, tenantId } });
    if (!pool) throw new NotFoundException(`Talent pool ${id} not found`);
    return pool;
  }

  async nominateMember(tenantId: string, poolId: string, dto: { employeeId: string; employeeName: string; readiness?: string; nominatedByUserId?: string; rationale?: string }): Promise<TalentPoolMember> {
    await this.getPool(tenantId, poolId);
    if (!dto.employeeId) throw new BadRequestException('employeeId is required');
    const existing = await this.memberRepo.findOne({ where: { tenantId, poolId, employeeId: dto.employeeId } });
    if (existing && existing.status !== PoolMemberStatus.EXITED) {
      throw new BadRequestException('Employee is already a member of this pool');
    }
    const member = await this.memberRepo.save(this.memberRepo.create({
      tenantId, poolId, employeeId: dto.employeeId, employeeName: dto.employeeName,
      status: PoolMemberStatus.NOMINATED, readiness: dto.readiness ?? null,
      nominatedByUserId: dto.nominatedByUserId ?? null, rationale: dto.rationale ?? null,
    }));
    await this.automation?.emit(tenantId, 'talent_pool.nominated', {
      poolId, employeeId: dto.employeeId, employeeName: dto.employeeName,
    });
    return member;
  }

  listMembers(tenantId: string, poolId: string): Promise<TalentPoolMember[]> {
    return this.memberRepo.find({ where: { tenantId, poolId }, order: { employeeName: 'ASC' } });
  }

  async updateMember(tenantId: string, memberId: string, dto: { status?: PoolMemberStatus; readiness?: string; rationale?: string }): Promise<TalentPoolMember> {
    const member = await this.memberRepo.findOne({ where: { id: memberId, tenantId } });
    if (!member) throw new NotFoundException(`Pool member ${memberId} not found`);
    if (dto.status) member.status = dto.status;
    if (dto.readiness !== undefined) member.readiness = dto.readiness;
    if (dto.rationale !== undefined) member.rationale = dto.rationale;
    return this.memberRepo.save(member);
  }

  /**
   * Bench-strength view for a pool: active-member count vs target, plus a
   * readiness breakdown (ready-now bench depth is the key succession metric).
   */
  async poolCoverage(tenantId: string, poolId: string): Promise<{
    poolId: string; name: string; type: TalentPoolType; targetSize: number | null;
    activeMembers: number; readyNow: number; readinessBreakdown: Record<string, number>; coverageGap: number;
  }> {
    const pool = await this.getPool(tenantId, poolId);
    const members = (await this.memberRepo.find({ where: { tenantId, poolId } }))
      .filter((m) => m.status !== PoolMemberStatus.EXITED);
    const readinessBreakdown: Record<string, number> = {};
    for (const m of members) {
      const key = m.readiness ?? 'UNSPECIFIED';
      readinessBreakdown[key] = (readinessBreakdown[key] ?? 0) + 1;
    }
    const readyNow = readinessBreakdown['READY_NOW'] ?? 0;
    return {
      poolId, name: pool.name, type: pool.type, targetSize: pool.targetSize,
      activeMembers: members.length, readyNow, readinessBreakdown,
      coverageGap: pool.targetSize != null ? Math.max(0, pool.targetSize - members.length) : 0,
    };
  }

  // ─── Talent reviews (9-box) ───────────────────────────────────

  async createReview(tenantId: string, dto: { name: string; orgUnitId?: string; cycle?: string; facilitatorUserId?: string; hipoPoolId?: string }): Promise<TalentReview> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (dto.hipoPoolId) await this.getPool(tenantId, dto.hipoPoolId);
    return this.reviewRepo.save(this.reviewRepo.create({
      tenantId, name: dto.name.trim(), orgUnitId: dto.orgUnitId ?? null,
      cycle: dto.cycle ?? null, facilitatorUserId: dto.facilitatorUserId ?? null,
      hipoPoolId: dto.hipoPoolId ?? null, status: TalentReviewStatus.DRAFT,
    }));
  }

  listReviews(tenantId: string, status?: TalentReviewStatus): Promise<TalentReview[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.reviewRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getReview(tenantId: string, id: string): Promise<TalentReview> {
    const review = await this.reviewRepo.findOne({ where: { id, tenantId } });
    if (!review) throw new NotFoundException(`Talent review ${id} not found`);
    return review;
  }

  /** Place (or re-place) an employee on the grid; box + label are derived. */
  async placeEmployee(tenantId: string, reviewId: string, dto: { employeeId: string; employeeName: string; performance: Rating3; potential: Rating3; flightRisk?: string; impactOfLoss?: string; notes?: string }): Promise<NineBoxPlacement> {
    const review = await this.getReview(tenantId, reviewId);
    if (review.status === TalentReviewStatus.FINALIZED) throw new BadRequestException('A finalized review cannot be edited');
    if (!dto.employeeId) throw new BadRequestException('employeeId is required');
    const { box, boxLabel } = CareerService.computeBox(dto.performance, dto.potential);
    let placement = await this.placementRepo.findOne({ where: { tenantId, reviewId, employeeId: dto.employeeId } });
    if (!placement) placement = this.placementRepo.create({ tenantId, reviewId, employeeId: dto.employeeId, employeeName: dto.employeeName });
    Object.assign(placement, {
      employeeName: dto.employeeName, performance: dto.performance, potential: dto.potential,
      box, boxLabel, flightRisk: dto.flightRisk ?? null, impactOfLoss: dto.impactOfLoss ?? null, notes: dto.notes ?? null,
    });
    return this.placementRepo.save(placement);
  }

  listPlacements(tenantId: string, reviewId: string): Promise<NineBoxPlacement[]> {
    return this.placementRepo.find({ where: { tenantId, reviewId }, order: { box: 'DESC', employeeName: 'ASC' } });
  }

  async startCalibration(tenantId: string, reviewId: string): Promise<TalentReview> {
    const review = await this.getReview(tenantId, reviewId);
    if (review.status !== TalentReviewStatus.DRAFT) throw new BadRequestException('Only DRAFT reviews can enter calibration');
    review.status = TalentReviewStatus.IN_CALIBRATION;
    return this.reviewRepo.save(review);
  }

  /** 9-box distribution: count of placements in each of the 9 boxes. */
  async distribution(tenantId: string, reviewId: string): Promise<Array<{ box: number; boxLabel: string; count: number }>> {
    await this.getReview(tenantId, reviewId);
    const placements = await this.placementRepo.find({ where: { tenantId, reviewId } });
    return Array.from({ length: 9 }, (_, i) => {
      const box = i + 1;
      return { box, boxLabel: BOX_LABELS[box], count: placements.filter((p) => p.box === box).length };
    }).reverse();
  }

  /**
   * Finalise a review: locks it and flows top-box talent (box ≥ 8 — Star /
   * High Potential) into the linked HiPo pool as nominations. Emits
   * talent_review.finalized.
   */
  async finalize(tenantId: string, reviewId: string): Promise<{ review: TalentReview; promotedToPool: number }> {
    const review = await this.getReview(tenantId, reviewId);
    if (review.status === TalentReviewStatus.FINALIZED) throw new BadRequestException('Review is already finalized');
    const placements = await this.placementRepo.find({ where: { tenantId, reviewId } });

    let promotedToPool = 0;
    if (review.hipoPoolId) {
      for (const p of placements.filter((pl) => pl.box >= 8)) {
        const existing = await this.memberRepo.findOne({ where: { tenantId, poolId: review.hipoPoolId, employeeId: p.employeeId } });
        if (!existing) {
          await this.memberRepo.save(this.memberRepo.create({
            tenantId, poolId: review.hipoPoolId, employeeId: p.employeeId, employeeName: p.employeeName,
            status: PoolMemberStatus.NOMINATED, readiness: null,
            rationale: `Auto-nominated from talent review "${review.name}" (${p.boxLabel})`,
          }));
          promotedToPool++;
        }
      }
    }

    review.status = TalentReviewStatus.FINALIZED;
    review.finalizedAt = new Date();
    const saved = await this.reviewRepo.save(review);
    await this.automation?.emit(tenantId, 'talent_review.finalized', {
      reviewId, name: review.name, placements: placements.length, promotedToPool,
    });
    return { review: saved, promotedToPool };
  }
}
