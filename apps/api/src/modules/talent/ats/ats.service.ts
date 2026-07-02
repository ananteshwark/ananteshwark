import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobPosting, JobStatus } from './entities/job-posting.entity';
import { Applicant, ApplicantStatus } from './entities/applicant.entity';
import { InterviewSchedule, InterviewStatus, InterviewRecommendation } from './entities/interview-schedule.entity';
import { JobOffer, OfferStatus } from './entities/job-offer.entity';
import { CreateJobPostingDto, SubmitApplicationDto, ScheduleInterviewDto, RecordFeedbackDto, MakeOfferDto } from './dto/ats.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class AtsService {
  constructor(
    @InjectRepository(JobPosting) private jobRepo: Repository<JobPosting>,
    @InjectRepository(Applicant) private applicantRepo: Repository<Applicant>,
    @InjectRepository(InterviewSchedule) private interviewRepo: Repository<InterviewSchedule>,
    @InjectRepository(JobOffer) private offerRepo: Repository<JobOffer>,
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

  async recordInterviewFeedback(tenantId: string, id: string, dto: RecordFeedbackDto): Promise<InterviewSchedule> {
    const interview = await this.interviewRepo.findOne({ where: { id, tenantId } });
    if (!interview) throw new NotFoundException('Interview not found');
    interview.feedback = dto.feedback || null;
    interview.rating = dto.rating || null;
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
}
