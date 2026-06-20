import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ManpowerRequisition, RequisitionStatus } from './entities/manpower-requisition.entity';
import { CreateRequisitionDto, UpdateRequisitionDto } from './dto/hiring.dto';
import { AtsService } from '../ats/ats.service';
import { JobPosting, JobStatus } from '../ats/entities/job-posting.entity';
import { Applicant } from '../ats/entities/applicant.entity';
import { InterviewSchedule } from '../ats/entities/interview-schedule.entity';
import { JobOffer } from '../ats/entities/job-offer.entity';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class HiringService {
  constructor(
    @InjectRepository(ManpowerRequisition)
    private readonly reqRepo: Repository<ManpowerRequisition>,
    @InjectRepository(JobPosting)
    private readonly jobRepo: Repository<JobPosting>,
    @InjectRepository(Applicant)
    private readonly applicantRepo: Repository<Applicant>,
    @InjectRepository(InterviewSchedule)
    private readonly interviewRepo: Repository<InterviewSchedule>,
    @InjectRepository(JobOffer)
    private readonly offerRepo: Repository<JobOffer>,
    private readonly atsService: AtsService,
  ) {}

  // ── Requisitions ───────────────────────────────────────────────────────────

  async createRequisition(tenantId: string, requestedById: string, dto: CreateRequisitionDto): Promise<ManpowerRequisition> {
    const req = this.reqRepo.create({
      ...dto,
      tenantId,
      requestedById,
      status: RequisitionStatus.DRAFT,
      vacancies: dto.vacancies ?? 1,
      currency: dto.currency ?? 'INR',
    });
    return this.reqRepo.save(req);
  }

  async listRequisitions(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { status?: string; departmentId?: string; requestedById?: string },
  ): Promise<PaginatedResponseDto<ManpowerRequisition>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.reqRepo.createQueryBuilder('r').where('r.tenant_id = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('r.department_id = :deptId', { deptId: filters.departmentId });
    if (filters?.requestedById) qb.andWhere('r.requested_by_id = :uid', { uid: filters.requestedById });
    qb.orderBy('r.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getRequisition(tenantId: string, id: string): Promise<any> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    let jobPosting = null;
    let applicantCount = 0;
    if (req.jobPostingId) {
      jobPosting = await this.jobRepo.findOne({ where: { id: req.jobPostingId, tenantId } });
      applicantCount = await this.applicantRepo.count({ where: { jobPostingId: req.jobPostingId, tenantId } });
    }
    return { ...req, jobPosting, applicantCount };
  }

  async updateRequisition(tenantId: string, id: string, dto: UpdateRequisitionDto): Promise<ManpowerRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.DRAFT && req.status !== RequisitionStatus.REJECTED) {
      throw new BadRequestException('Only DRAFT or REJECTED requisitions can be edited');
    }
    Object.assign(req, dto);
    if (req.status === RequisitionStatus.REJECTED) req.status = RequisitionStatus.DRAFT;
    return this.reqRepo.save(req);
  }

  async submitRequisition(tenantId: string, id: string): Promise<ManpowerRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.DRAFT) throw new BadRequestException('Only DRAFT requisitions can be submitted');
    req.status = RequisitionStatus.SUBMITTED;
    return this.reqRepo.save(req);
  }

  async approveRequisition(tenantId: string, id: string, approverId: string): Promise<ManpowerRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.SUBMITTED) throw new BadRequestException('Only SUBMITTED requisitions can be approved');
    req.status = RequisitionStatus.APPROVED;
    req.approvedById = approverId;
    req.approvedAt = new Date();
    return this.reqRepo.save(req);
  }

  async rejectRequisition(tenantId: string, id: string, approverId: string, reason?: string): Promise<ManpowerRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.SUBMITTED) throw new BadRequestException('Only SUBMITTED requisitions can be rejected');
    req.status = RequisitionStatus.REJECTED;
    req.approvedById = approverId;
    req.rejectionReason = reason ?? null;
    return this.reqRepo.save(req);
  }

  async openRequisition(tenantId: string, id: string, userId: string): Promise<any> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if (req.status !== RequisitionStatus.APPROVED) throw new BadRequestException('Requisition must be APPROVED before opening');
    const job = await this.atsService.createJobPosting(tenantId, userId, {
      title: req.title,
      departmentId: req.departmentId ?? undefined,
      designationId: req.designationId ?? undefined,
      vacancies: req.vacancies,
      description: req.jobDescription,
      requirements: req.requirements ?? undefined,
      location: req.location ?? undefined,
      salaryMin: req.budgetMin ?? undefined,
      salaryMax: req.budgetMax ?? undefined,
      currency: req.currency,
      closingDate: req.expectedJoiningDate ?? undefined,
    });
    req.status = RequisitionStatus.OPEN;
    req.jobPostingId = job.id;
    const saved = await this.reqRepo.save(req);
    return { ...saved, jobPosting: job };
  }

  async cancelRequisition(tenantId: string, id: string): Promise<ManpowerRequisition> {
    const req = await this.reqRepo.findOne({ where: { id, tenantId } });
    if (!req) throw new NotFoundException(`Requisition ${id} not found`);
    if ([RequisitionStatus.FULFILLED, RequisitionStatus.CANCELLED].includes(req.status)) {
      throw new BadRequestException('Cannot cancel a fulfilled or already-cancelled requisition');
    }
    req.status = RequisitionStatus.CANCELLED;
    return this.reqRepo.save(req);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<any> {
    const [
      totalReqs, pendingApproval, approvedReqs, openJobs,
      totalCandidates, interviewsScheduled, pendingOffers,
    ] = await Promise.all([
      this.reqRepo.count({ where: { tenantId } }),
      this.reqRepo.count({ where: { tenantId, status: RequisitionStatus.SUBMITTED } }),
      this.reqRepo.count({ where: { tenantId, status: RequisitionStatus.APPROVED } }),
      this.reqRepo.count({ where: { tenantId, status: RequisitionStatus.OPEN } }),
      this.applicantRepo.count({ where: { tenantId } }),
      this.interviewRepo.count({ where: { tenantId, status: 'SCHEDULED' as any } }),
      this.offerRepo.count({ where: { tenantId, status: 'DRAFTED' as any } }),
    ]);
    return { totalReqs, pendingApproval, approvedReqs, openJobs, totalCandidates, interviewsScheduled, pendingOffers };
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────

  async getPipeline(tenantId: string): Promise<any[]> {
    const jobs = await this.jobRepo.find({
      where: { tenantId, status: JobStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
    });
    const result = await Promise.all(jobs.map(async job => {
      const applicants = await this.applicantRepo.find({ where: { tenantId, jobPostingId: job.id } });
      const byStage: Record<string, any[]> = {};
      for (const a of applicants) {
        if (!byStage[a.status]) byStage[a.status] = [];
        byStage[a.status].push(a);
      }
      return { job, byStage, total: applicants.length };
    }));
    return result;
  }

  // ── Interviews ─────────────────────────────────────────────────────────────

  async listInterviews(tenantId: string, filters?: { jobPostingId?: string; status?: string }): Promise<InterviewSchedule[]> {
    const qb = this.interviewRepo.createQueryBuilder('i')
      .where('i.tenant_id = :tenantId', { tenantId })
      .orderBy('i.scheduled_at', 'DESC');
    if (filters?.jobPostingId) qb.andWhere('i.job_posting_id = :jobId', { jobId: filters.jobPostingId });
    if (filters?.status) qb.andWhere('i.status = :status', { status: filters.status });
    return qb.getMany();
  }

  // ── Offers ─────────────────────────────────────────────────────────────────

  async listOffers(tenantId: string, filters?: { jobPostingId?: string }): Promise<JobOffer[]> {
    const qb = this.offerRepo.createQueryBuilder('o')
      .where('o.tenant_id = :tenantId', { tenantId })
      .orderBy('o.offer_date', 'DESC');
    if (filters?.jobPostingId) qb.andWhere('o.job_posting_id = :jobId', { jobId: filters.jobPostingId });
    return qb.getMany();
  }
}
