import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, IsNull } from 'typeorm';
import { HrCase, HrCaseComment, HrCaseCategory, HrCasePriority, HrCaseStatus } from './entities/hr-case.entity';
import { HrCaseRoutingRule, RoutingStrategy } from './entities/hr-case-routing-rule.entity';
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
    @Optional() @InjectRepository(HrCaseRoutingRule)
    private readonly routingRepo?: Repository<HrCaseRoutingRule>,
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
    let saved = await this.caseRepo.save(hrCase);
    saved = await this.autoAssign(tenantId, saved);
    await this.automation?.emit(tenantId, 'hr_case.created', {
      caseId: saved.id, caseNumber: saved.caseNumber, subject: saved.subject,
      category: saved.category, priority: saved.priority, employeeId: saved.employeeId,
    });
    return saved;
  }

  /**
   * Route a new case via the most specific active rule: category+priority
   * beats category-only beats priority-only beats catch-all. Round-robin
   * advances the rule's cursor; least-loaded picks the pool agent with the
   * fewest open cases. Best-effort — routing failures never block creation.
   */
  private async autoAssign(tenantId: string, hrCase: HrCase): Promise<HrCase> {
    if (!this.routingRepo) return hrCase;
    try {
      const rules = await this.routingRepo.find({ where: { tenantId, isActive: true } });
      const specificity = (r: HrCaseRoutingRule) =>
        (r.category === hrCase.category ? 2 : r.category === null ? 0 : -100) +
        (r.priority === hrCase.priority ? 1 : r.priority === null ? 0 : -100);
      const rule = rules
        .filter((r) => specificity(r) >= 0 && r.agentUserIds?.length)
        .sort((a, b) => specificity(b) - specificity(a))[0];
      if (!rule) return hrCase;

      let agentId: string;
      if (rule.strategy === RoutingStrategy.LEAST_LOADED) {
        const loads = await Promise.all(rule.agentUserIds.map(async (uid) => ({
          uid,
          open: await this.caseRepo.count({
            where: { tenantId, assignedToId: uid, status: In([HrCaseStatus.OPEN, HrCaseStatus.IN_PROGRESS, HrCaseStatus.ON_HOLD]) },
          }),
        })));
        loads.sort((a, b) => a.open - b.open);
        agentId = loads[0].uid;
      } else {
        const nextIndex = (Number(rule.lastAssignedIndex) + 1) % rule.agentUserIds.length;
        agentId = rule.agentUserIds[nextIndex];
        rule.lastAssignedIndex = nextIndex;
        await this.routingRepo.save(rule);
      }
      hrCase.assignedToId = agentId;
      return await this.caseRepo.save(hrCase);
    } catch {
      return hrCase; // routing must never break case creation
    }
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

  // ---- Routing rules ----
  async createRoutingRule(tenantId: string, dto: Partial<HrCaseRoutingRule>): Promise<HrCaseRoutingRule> {
    if (!this.routingRepo) throw new BadRequestException('Routing rules are not available in this deployment');
    if (!dto.name?.trim() || !dto.agentUserIds?.length) {
      throw new BadRequestException('name and a non-empty agentUserIds pool are required');
    }
    return this.routingRepo.save(this.routingRepo.create({ ...dto, tenantId }));
  }

  async listRoutingRules(tenantId: string): Promise<HrCaseRoutingRule[]> {
    if (!this.routingRepo) return [];
    return this.routingRepo.find({ where: { tenantId, isActive: true }, order: { createdAt: 'ASC' } });
  }

  async deactivateRoutingRule(tenantId: string, id: string): Promise<HrCaseRoutingRule> {
    if (!this.routingRepo) throw new BadRequestException('Routing rules are not available in this deployment');
    const rule = await this.routingRepo.findOne({ where: { tenantId, id } });
    if (!rule) throw new NotFoundException(`Routing rule ${id} not found`);
    rule.isActive = false;
    return this.routingRepo.save(rule);
  }

  // ---- SLA escalation sweep ----
  /**
   * Escalate open cases past their SLA: stamp escalatedAt once, reassign to
   * the matching rule's escalation contact when configured, and emit
   * hr_case.sla_escalated for notification rules.
   */
  async escalateOverdueSla(tenantId: string): Promise<{ escalated: number }> {
    const overdue = await this.caseRepo.find({
      where: {
        tenantId,
        status: In([HrCaseStatus.OPEN, HrCaseStatus.IN_PROGRESS]),
        slaDueAt: LessThan(new Date()),
        escalatedAt: IsNull(),
      },
    });
    if (!overdue.length) return { escalated: 0 };

    const rules = this.routingRepo
      ? await this.routingRepo.find({ where: { tenantId, isActive: true } })
      : [];
    let escalated = 0;
    for (const hrCase of overdue) {
      const rule = rules
        .filter((r) => (r.category === null || r.category === hrCase.category) && r.escalationUserId)
        .sort((a, b) => (b.category ? 1 : 0) - (a.category ? 1 : 0))[0];
      hrCase.escalatedAt = new Date();
      if (rule?.escalationUserId) hrCase.assignedToId = rule.escalationUserId;
      await this.caseRepo.save(hrCase);
      await this.automation?.emit(tenantId, 'hr_case.sla_escalated', {
        caseId: hrCase.id, caseNumber: hrCase.caseNumber, subject: hrCase.subject,
        category: hrCase.category, priority: hrCase.priority,
        assignedToId: hrCase.assignedToId, slaDueAt: hrCase.slaDueAt,
      });
      escalated += 1;
    }
    return { escalated };
  }

  // ---- Closure feedback (CSAT) ----
  async submitFeedback(
    tenantId: string, id: string, userId: string,
    dto: { score: number; comment?: string },
  ): Promise<HrCase> {
    const hrCase = await this.getCase(tenantId, id);
    if (hrCase.createdByUserId !== userId) {
      throw new ForbiddenException('Only the requester can rate this case');
    }
    if (![HrCaseStatus.RESOLVED, HrCaseStatus.CLOSED].includes(hrCase.status)) {
      throw new BadRequestException('Feedback can only be given on resolved or closed cases');
    }
    if (hrCase.csatScore != null) throw new BadRequestException('Feedback was already submitted for this case');
    const score = Number(dto.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new BadRequestException('score must be an integer from 1 to 5');
    }
    hrCase.csatScore = score;
    hrCase.csatComment = dto.comment?.trim() || null;
    return this.caseRepo.save(hrCase);
  }
}
