import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrCase, HrCaseComment, HrCaseCategory, HrCasePriority, HrCaseStatus } from './entities/hr-case.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

// Resolution SLA per priority, in hours.
const SLA_HOURS: Record<HrCasePriority, number> = {
  [HrCasePriority.URGENT]: 4,
  [HrCasePriority.HIGH]: 8,
  [HrCasePriority.MEDIUM]: 24,
  [HrCasePriority.LOW]: 72,
};

const VALID_TRANSITIONS: Record<HrCaseStatus, HrCaseStatus[]> = {
  [HrCaseStatus.OPEN]: [HrCaseStatus.IN_PROGRESS, HrCaseStatus.ON_HOLD, HrCaseStatus.RESOLVED, HrCaseStatus.CLOSED],
  [HrCaseStatus.IN_PROGRESS]: [HrCaseStatus.ON_HOLD, HrCaseStatus.RESOLVED, HrCaseStatus.CLOSED],
  [HrCaseStatus.ON_HOLD]: [HrCaseStatus.IN_PROGRESS, HrCaseStatus.RESOLVED, HrCaseStatus.CLOSED],
  [HrCaseStatus.RESOLVED]: [HrCaseStatus.CLOSED, HrCaseStatus.IN_PROGRESS], // reopen allowed
  [HrCaseStatus.CLOSED]: [],
};

@Injectable()
export class HelpdeskService {
  constructor(
    @InjectRepository(HrCase) private readonly caseRepo: Repository<HrCase>,
    @InjectRepository(HrCaseComment) private readonly commentRepo: Repository<HrCaseComment>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  private async nextCaseNumber(tenantId: string): Promise<string> {
    const row = await this.caseRepo
      .createQueryBuilder('c')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(c.case_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('c.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `HRC-${String(next).padStart(6, '0')}`;
  }

  async createCase(
    tenantId: string,
    createdByUserId: string,
    dto: {
      subject: string; description: string; category?: HrCaseCategory;
      priority?: HrCasePriority; employeeId?: string; confidential?: boolean;
    },
  ): Promise<HrCase> {
    if (!dto.subject?.trim()) throw new BadRequestException('Subject is required');
    const category = dto.category ?? HrCaseCategory.OTHER;
    const priority = dto.priority ?? HrCasePriority.MEDIUM;
    const caseNumber = await this.nextCaseNumber(tenantId);
    const slaDueAt = new Date(Date.now() + SLA_HOURS[priority] * 3600_000);
    const hrCase = this.caseRepo.create({
      tenantId,
      caseNumber,
      subject: dto.subject.trim(),
      description: dto.description ?? '',
      category,
      priority,
      employeeId: dto.employeeId ?? null,
      // Grievances are always confidential regardless of what was asked.
      confidential: category === HrCaseCategory.GRIEVANCE ? true : (dto.confidential ?? false),
      status: HrCaseStatus.OPEN,
      slaDueAt,
      createdByUserId,
    });
    const saved = await this.caseRepo.save(hrCase);
    await this.automation?.emit(tenantId, 'hr_case.created', {
      caseId: saved.id, caseNumber: saved.caseNumber, subject: saved.subject,
      category: saved.category, priority: saved.priority, employeeId: saved.employeeId,
    });
    return saved;
  }

  /** Cases the caller raised (self-service view). */
  async myCases(tenantId: string, userId: string): Promise<HrCase[]> {
    return this.caseRepo.find({
      where: { tenantId, createdByUserId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listCases(
    tenantId: string,
    pagination: PaginationDto,
    filters: { status?: HrCaseStatus; category?: HrCaseCategory; assignedToId?: string } = {},
  ): Promise<PaginatedResponseDto<HrCase>> {
    const { page = 1, limit = 20 } = pagination;
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    const [items, total] = await this.caseRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getCase(tenantId: string, id: string): Promise<HrCase> {
    const hrCase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!hrCase) throw new NotFoundException(`HR case ${id} not found`);
    return hrCase;
  }

  async assign(tenantId: string, id: string, assignedToId: string): Promise<HrCase> {
    const hrCase = await this.getCase(tenantId, id);
    if (hrCase.status === HrCaseStatus.CLOSED) {
      throw new BadRequestException('Closed cases cannot be reassigned');
    }
    hrCase.assignedToId = assignedToId;
    if (hrCase.status === HrCaseStatus.OPEN) hrCase.status = HrCaseStatus.IN_PROGRESS;
    return this.caseRepo.save(hrCase);
  }

  async updateStatus(
    tenantId: string, id: string, status: HrCaseStatus, resolutionNotes?: string,
  ): Promise<HrCase> {
    const hrCase = await this.getCase(tenantId, id);
    if (!VALID_TRANSITIONS[hrCase.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move case from ${hrCase.status} to ${status}`);
    }
    if (status === HrCaseStatus.RESOLVED) {
      if (!resolutionNotes?.trim()) throw new BadRequestException('Resolution notes are required to resolve a case');
      hrCase.resolutionNotes = resolutionNotes.trim();
      hrCase.resolvedAt = new Date();
    }
    hrCase.status = status;
    const saved = await this.caseRepo.save(hrCase);
    if (status === HrCaseStatus.RESOLVED) {
      await this.automation?.emit(tenantId, 'hr_case.resolved', {
        caseId: saved.id, caseNumber: saved.caseNumber, subject: saved.subject,
        category: saved.category, employeeId: saved.employeeId,
      });
    }
    return saved;
  }

  async addComment(
    tenantId: string, caseId: string,
    author: { userId: string; name: string }, body: string, internal = false,
  ): Promise<HrCaseComment> {
    if (!body?.trim()) throw new BadRequestException('Comment body is required');
    await this.getCase(tenantId, caseId);
    const comment = this.commentRepo.create({
      tenantId, caseId, authorUserId: author.userId, authorName: author.name,
      body: body.trim(), internal,
    });
    return this.commentRepo.save(comment);
  }

  /** Requesters see public comments only; the HR team also sees internal notes. */
  async listComments(tenantId: string, caseId: string, includeInternal: boolean): Promise<HrCaseComment[]> {
    const comments = await this.commentRepo.find({
      where: { tenantId, caseId },
      order: { createdAt: 'ASC' },
    });
    return includeInternal ? comments : comments.filter(c => !c.internal);
  }
}
