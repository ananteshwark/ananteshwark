import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting, JobStatus } from './entities/job-posting.entity';
import { Applicant, ApplicantStatus } from './entities/applicant.entity';
import { InterviewSchedule, InterviewStatus, InterviewRecommendation } from './entities/interview-schedule.entity';
import { JobOffer, OfferStatus } from './entities/job-offer.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { CreateJobPostingDto, SubmitApplicationDto, ScheduleInterviewDto, RecordFeedbackDto, MakeOfferDto } from './dto/ats.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class AtsService {
  constructor(
    @InjectRepository(JobPosting) private jobRepo: Repository<JobPosting>,
    @InjectRepository(Applicant) private applicantRepo: Repository<Applicant>,
    @InjectRepository(InterviewSchedule) private interviewRepo: Repository<InterviewSchedule>,
    @InjectRepository(JobOffer) private offerRepo: Repository<JobOffer>,
    @Optional() @InjectRepository(Referral) private readonly referralRepo?: Repository<Referral>,
  ) {}

  async createJobPosting(tenantId: string, userId: string, dto: CreateJobPostingDto): Promise<JobPosting> {
    const job = this.jobRepo.create({
      ...dto,
      tenantId,
      createdById: userId,
      status: JobStatus.DRAFT,
    });
    return this.jobRepo.save(job);
  }

  async updateJobPosting(tenantId: string, id: string, dto: any): Promise<JobPosting> {
    const job = await this.jobRepo.findOne({ where: { id, tenantId } });
    if (!job) throw new NotFoundException(`Job posting ${id} not found`);
    const { tenantId: _t, id: _i, status: _s, createdById: _c, ...rest } = dto ?? {};
    Object.assign(job, rest);
    return this.jobRepo.save(job);
  }

  async publishJob(tenantId: string, id: string): Promise<JobPosting> {
    const job = await this.jobRepo.findOne({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job posting not found');
    job.status = JobStatus.PUBLISHED;
    job.publishedAt = new Date();
    return this.jobRepo.save(job);
  }

  async closeJob(tenantId: string, id: string): Promise<JobPosting> {
    const job = await this.jobRepo.findOne({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job posting not found');
    job.status = JobStatus.CLOSED;
    job.closedAt = new Date();
    return this.jobRepo.save(job);
  }

  async listJobPostings(tenantId: string, pagination: PaginationDto, filters?: { status?: JobStatus; departmentId?: string }): Promise<PaginatedResponseDto<JobPosting>> {
    const qb = this.jobRepo.createQueryBuilder('j').where('j.tenant_id = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('j.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('j.department_id = :departmentId', { departmentId: filters.departmentId });
    qb.orderBy('j.createdAt', 'DESC');
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getJobPosting(tenantId: string, id: string): Promise<JobPosting> {
    const job = await this.jobRepo.findOne({ where: { id, tenantId } });
    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  async submitApplication(tenantId: string, dto: SubmitApplicationDto): Promise<Applicant> {
    const applicant = this.applicantRepo.create({
      ...dto,
      tenantId,
      status: ApplicantStatus.NEW,
      applicationDate: new Date().toISOString().split('T')[0],
    });
    return this.applicantRepo.save(applicant);
  }

  async shortlistApplicant(tenantId: string, id: string): Promise<Applicant> {
    const applicant = await this.applicantRepo.findOne({ where: { id, tenantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');
    applicant.status = ApplicantStatus.SHORTLISTED;
    return this.applicantRepo.save(applicant);
  }

  async scheduleInterview(tenantId: string, dto: ScheduleInterviewDto): Promise<InterviewSchedule> {
    const interview = this.interviewRepo.create({
      ...dto,
      tenantId,
      scheduledAt: new Date(dto.scheduledAt),
      status: InterviewStatus.SCHEDULED,
    });
    const saved = await this.interviewRepo.save(interview);
    await this.applicantRepo.update({ id: dto.applicantId, tenantId }, { status: ApplicantStatus.INTERVIEW_SCHEDULED });
    return saved;
  }

  async recordInterviewFeedback(
    tenantId: string, id: string,
    dto: RecordFeedbackDto & { evaluationScores?: Record<string, number> },
  ): Promise<InterviewSchedule> {
    const interview = await this.interviewRepo.findOne({ where: { id, tenantId } });
    if (!interview) throw new NotFoundException('Interview not found');
    interview.feedback = dto.feedback || null;
    // Structured evaluation form: 1-5 per criterion; overall rating defaults
    // to the rounded average when not supplied explicitly.
    if (dto.evaluationScores && Object.keys(dto.evaluationScores).length) {
      const scores = Object.values(dto.evaluationScores).map(Number);
      if (scores.some((s) => !Number.isFinite(s) || s < 1 || s > 5)) {
        throw new BadRequestException('Evaluation scores must be between 1 and 5');
      }
      interview.evaluationScores = dto.evaluationScores;
      interview.rating = dto.rating ?? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    } else {
      interview.rating = dto.rating || null;
    }
    interview.recommendation = dto.recommendation as InterviewRecommendation || null;
    interview.status = InterviewStatus.COMPLETED;
    const saved = await this.interviewRepo.save(interview);
    await this.applicantRepo.update({ id: interview.applicantId, tenantId }, { status: ApplicantStatus.INTERVIEW_DONE });
    return saved;
  }

  async makeOffer(tenantId: string, dto: MakeOfferDto): Promise<JobOffer> {
    const offer = this.offerRepo.create({ ...dto, tenantId, status: OfferStatus.DRAFTED });
    const saved = await this.offerRepo.save(offer);
    await this.applicantRepo.update({ id: dto.applicantId, tenantId }, { status: ApplicantStatus.OFFER_MADE });
    return saved;
  }

  async acceptOffer(tenantId: string, id: string): Promise<JobOffer> {
    const offer = await this.offerRepo.findOne({ where: { id, tenantId } });
    if (!offer) throw new NotFoundException('Offer not found');
    offer.status = OfferStatus.ACCEPTED;
    const saved = await this.offerRepo.save(offer);
    await this.applicantRepo.update({ id: offer.applicantId, tenantId }, { status: ApplicantStatus.OFFER_ACCEPTED });
    // A referred candidate accepting an offer makes the referral bonus-eligible.
    await this.markReferralHired(tenantId, offer.applicantId).catch(() => undefined);
    return saved;
  }

  async declineOffer(tenantId: string, id: string): Promise<JobOffer> {
    const offer = await this.offerRepo.findOne({ where: { id, tenantId } });
    if (!offer) throw new NotFoundException('Offer not found');
    offer.status = OfferStatus.DECLINED;
    const saved = await this.offerRepo.save(offer);
    await this.applicantRepo.update({ id: offer.applicantId, tenantId }, { status: ApplicantStatus.OFFER_DECLINED });
    return saved;
  }

  async rejectApplicant(tenantId: string, id: string): Promise<Applicant> {
    const applicant = await this.applicantRepo.findOne({ where: { id, tenantId } });
    if (!applicant) throw new NotFoundException('Applicant not found');
    applicant.status = ApplicantStatus.REJECTED;
    return this.applicantRepo.save(applicant);
  }

  async getHiringFunnel(tenantId: string, jobPostingId: string): Promise<Record<string, number>> {
    const counts = await this.applicantRepo
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('a.tenant_id = :tenantId AND a.job_posting_id = :jobPostingId', { tenantId, jobPostingId })
      .groupBy('a.status')
      .getRawMany();
    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.status] = parseInt(row.count, 10);
    }
    return result;
  }

  async listApplicants(tenantId: string, pagination: PaginationDto, filters?: { jobPostingId?: string; status?: ApplicantStatus }): Promise<PaginatedResponseDto<Applicant>> {
    const qb = this.applicantRepo.createQueryBuilder('a').where('a.tenant_id = :tenantId', { tenantId });
    if (filters?.jobPostingId) qb.andWhere('a.job_posting_id = :jobPostingId', { jobPostingId: filters.jobPostingId });
    if (filters?.status) qb.andWhere('a.status = :status', { status: filters.status });
    qb.orderBy('a.application_date', 'DESC');
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // ─── Internal job postings (IJP) ──────────────────────────────

  /** Published internal-only postings — the IJP board employees browse. */
  async listInternalPostings(tenantId: string): Promise<JobPosting[]> {
    return this.jobRepo.find({
      where: { tenantId, status: JobStatus.PUBLISHED, internalOnly: true },
      order: { publishedAt: 'DESC' },
    });
  }

  // ─── Referrals ────────────────────────────────────────────────

  /**
   * Refer a candidate: records the referral and files an application on the
   * referred candidate's behalf (source flows from the DTO).
   */
  async submitReferral(
    tenantId: string, referrer: { userId: string; name: string },
    dto: { jobPostingId: string; candidateName: string; candidateEmail: string; resumeUrl?: string; note?: string },
  ): Promise<Referral> {
    if (!this.referralRepo) throw new BadRequestException('Referrals are not available in this deployment');
    const job = await this.jobRepo.findOne({ where: { id: dto.jobPostingId, tenantId } });
    if (!job) throw new NotFoundException(`Job posting ${dto.jobPostingId} not found`);
    if (!dto.candidateName?.trim() || !dto.candidateEmail?.trim()) {
      throw new BadRequestException('candidateName and candidateEmail are required');
    }
    const [firstName, ...rest] = dto.candidateName.trim().split(/\s+/);
    const applicant = await this.applicantRepo.save(this.applicantRepo.create({
      tenantId,
      jobPostingId: dto.jobPostingId,
      firstName,
      lastName: rest.join(' ') || '-',
      email: dto.candidateEmail.trim(),
      resumeUrl: dto.resumeUrl ?? null,
      status: ApplicantStatus.NEW,
      source: 'REFERRAL' as any,
      applicationDate: new Date().toISOString().split('T')[0],
    } as any));

    return this.referralRepo.save(this.referralRepo.create({
      tenantId,
      jobPostingId: dto.jobPostingId,
      referrerUserId: referrer.userId,
      referrerName: referrer.name,
      candidateName: dto.candidateName.trim(),
      candidateEmail: dto.candidateEmail.trim(),
      applicantId: (applicant as any).id,
      status: ReferralStatus.SUBMITTED,
      bonusAmount: Number(job.referralBonus ?? 0),
      note: dto.note ?? null,
    }));
  }

  async listReferrals(tenantId: string, referrerUserId?: string): Promise<Referral[]> {
    if (!this.referralRepo) return [];
    const where: any = { tenantId };
    if (referrerUserId) where.referrerUserId = referrerUserId;
    return this.referralRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  private async markReferralHired(tenantId: string, applicantId: string): Promise<void> {
    if (!this.referralRepo) return;
    const referral = await this.referralRepo.findOne({ where: { tenantId, applicantId } });
    if (referral && referral.status === ReferralStatus.SUBMITTED) {
      referral.status = ReferralStatus.HIRED;
      await this.referralRepo.save(referral);
    }
  }

  // ─── Bulk offers ──────────────────────────────────────────────

  /**
   * Generate offers for several applicants in one call (shared joining/offer
   * dates and validity, per-applicant salary). Each applicant moves to
   * OFFER_MADE. Returns the created offers and any per-applicant errors.
   */
  async makeBulkOffers(
    tenantId: string,
    dto: {
      jobPostingId: string; joiningDate: string; offerDate: string; validUntil: string; terms?: string;
      offers: Array<{ applicantId: string; offeredSalary: number }>;
    },
  ): Promise<{ created: JobOffer[]; errors: Array<{ applicantId: string; error: string }> }> {
    if (!dto.jobPostingId || !dto.joiningDate || !dto.validUntil) {
      throw new BadRequestException('jobPostingId, joiningDate and validUntil are required');
    }
    const rows = (dto.offers ?? []).filter((o) => o.applicantId && Number(o.offeredSalary) > 0);
    if (!rows.length) throw new BadRequestException('At least one applicant offer is required');

    const created: JobOffer[] = [];
    const errors: Array<{ applicantId: string; error: string }> = [];
    for (const row of rows) {
      try {
        const offer = await this.offerRepo.save(this.offerRepo.create({
          tenantId,
          applicantId: row.applicantId,
          jobPostingId: dto.jobPostingId,
          offeredSalary: row.offeredSalary,
          joiningDate: dto.joiningDate,
          offerDate: dto.offerDate ?? new Date().toISOString().split('T')[0],
          validUntil: dto.validUntil,
          terms: dto.terms ?? null,
          status: OfferStatus.DRAFTED,
        } as any));
        await this.applicantRepo.update({ id: row.applicantId, tenantId }, { status: ApplicantStatus.OFFER_MADE });
        created.push(offer as any);
      } catch (e: any) {
        errors.push({ applicantId: row.applicantId, error: e?.message ?? 'Failed to create offer' });
      }
    }
    return { created, errors };
  }
}
