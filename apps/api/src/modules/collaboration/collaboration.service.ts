import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ExternalCollaborator, CollaboratorType, CollaboratorStatus,
  CollaboratorAssignment, CollaboratorResourceType, AssignmentStatus,
  CollaboratorSubmission, SubmissionKind, SubmissionStatus,
} from './entities/collaborator.entity';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class CollaborationService {
  constructor(
    @InjectRepository(ExternalCollaborator) private readonly collabRepo: Repository<ExternalCollaborator>,
    @InjectRepository(CollaboratorAssignment) private readonly assignmentRepo: Repository<CollaboratorAssignment>,
    @InjectRepository(CollaboratorSubmission) private readonly submissionRepo: Repository<CollaboratorSubmission>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Collaborators ────────────────────────────────────────────

  async invite(tenantId: string, dto: { type: CollaboratorType; orgName: string; contactName?: string; email: string; scopes?: string[]; accessExpiresAt?: string; invitedByUserId?: string }): Promise<ExternalCollaborator> {
    if (!dto.email?.trim() || !dto.orgName?.trim()) throw new BadRequestException('orgName and email are required');
    if (!Object.values(CollaboratorType).includes(dto.type)) throw new BadRequestException('A valid collaborator type is required');
    const existing = await this.collabRepo.findOne({ where: { tenantId, email: dto.email.trim().toLowerCase() } });
    if (existing) throw new BadRequestException('A collaborator with that email already exists');
    const collab = await this.collabRepo.save(this.collabRepo.create({
      tenantId, type: dto.type, orgName: dto.orgName.trim(), contactName: dto.contactName ?? null,
      email: dto.email.trim().toLowerCase(), scopes: dto.scopes ?? [], status: CollaboratorStatus.INVITED,
      invitedByUserId: dto.invitedByUserId ?? null, accessExpiresAt: dto.accessExpiresAt ?? null,
    }));
    await this.automation?.emit(tenantId, 'collaborator.invited', { collaboratorId: collab.id, type: collab.type, orgName: collab.orgName });
    return collab;
  }

  listCollaborators(tenantId: string, type?: CollaboratorType): Promise<ExternalCollaborator[]> {
    const where: any = { tenantId };
    if (type) where.type = type;
    return this.collabRepo.find({ where, order: { orgName: 'ASC' } });
  }

  async getCollaborator(tenantId: string, id: string): Promise<ExternalCollaborator> {
    const collab = await this.collabRepo.findOne({ where: { id, tenantId } });
    if (!collab) throw new NotFoundException(`Collaborator ${id} not found`);
    return collab;
  }

  async activate(tenantId: string, id: string): Promise<ExternalCollaborator> {
    const collab = await this.getCollaborator(tenantId, id);
    collab.status = CollaboratorStatus.ACTIVE;
    collab.activatedAt = collab.activatedAt ?? new Date();
    return this.collabRepo.save(collab);
  }

  async suspend(tenantId: string, id: string): Promise<ExternalCollaborator> {
    const collab = await this.getCollaborator(tenantId, id);
    collab.status = CollaboratorStatus.SUSPENDED;
    return this.collabRepo.save(collab);
  }

  async setScopes(tenantId: string, id: string, scopes: string[]): Promise<ExternalCollaborator> {
    const collab = await this.getCollaborator(tenantId, id);
    collab.scopes = scopes ?? [];
    return this.collabRepo.save(collab);
  }

  // ─── Assignments (record-level scoping) ───────────────────────

  async assignResource(tenantId: string, collaboratorId: string, dto: { resourceType: CollaboratorResourceType; resourceId: string; resourceLabel?: string; dueDate?: string; assignedByUserId?: string }): Promise<CollaboratorAssignment> {
    const collab = await this.getCollaborator(tenantId, collaboratorId);
    if (collab.status === CollaboratorStatus.SUSPENDED) throw new BadRequestException('Cannot assign work to a suspended collaborator');
    if (!dto.resourceId) throw new BadRequestException('resourceId is required');
    const existing = await this.assignmentRepo.findOne({ where: { tenantId, collaboratorId, resourceType: dto.resourceType, resourceId: dto.resourceId } });
    if (existing) throw new BadRequestException('That resource is already assigned to this collaborator');
    return this.assignmentRepo.save(this.assignmentRepo.create({
      tenantId, collaboratorId, resourceType: dto.resourceType, resourceId: dto.resourceId,
      resourceLabel: dto.resourceLabel ?? null, status: AssignmentStatus.ASSIGNED,
      assignedByUserId: dto.assignedByUserId ?? null, dueDate: dto.dueDate ?? null,
    }));
  }

  listAssignments(tenantId: string, collaboratorId: string, status?: AssignmentStatus): Promise<CollaboratorAssignment[]> {
    const where: any = { tenantId, collaboratorId };
    if (status) where.status = status;
    return this.assignmentRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async closeAssignment(tenantId: string, assignmentId: string): Promise<CollaboratorAssignment> {
    const a = await this.findAssignment(tenantId, assignmentId);
    a.status = AssignmentStatus.CLOSED;
    return this.assignmentRepo.save(a);
  }

  private async findAssignment(tenantId: string, id: string): Promise<CollaboratorAssignment> {
    const a = await this.assignmentRepo.findOne({ where: { id, tenantId } });
    if (!a) throw new NotFoundException(`Assignment ${id} not found`);
    return a;
  }

  /**
   * Portal access guard: a collaborator may act on a resource only if ACTIVE,
   * within their access window, and holding an open assignment to it.
   */
  async assertAccess(tenantId: string, collaboratorId: string, assignmentId: string, asOf: string): Promise<{ collaborator: ExternalCollaborator; assignment: CollaboratorAssignment }> {
    const collaborator = await this.getCollaborator(tenantId, collaboratorId);
    if (collaborator.status !== CollaboratorStatus.ACTIVE) throw new ForbiddenException('Collaborator is not active');
    if (collaborator.accessExpiresAt && collaborator.accessExpiresAt < asOf) throw new ForbiddenException('Collaborator access has expired');
    const assignment = await this.findAssignment(tenantId, assignmentId);
    if (assignment.collaboratorId !== collaboratorId) throw new ForbiddenException('Assignment does not belong to this collaborator');
    if (assignment.status === AssignmentStatus.CLOSED) throw new ForbiddenException('Assignment is closed');
    return { collaborator, assignment };
  }

  // ─── Submissions ──────────────────────────────────────────────

  /** Collaborator-facing: submit a candidate / BGV result / travel quote. */
  async submit(tenantId: string, collaboratorId: string, assignmentId: string, dto: { kind: SubmissionKind; payload: Record<string, any> }, asOf: string): Promise<CollaboratorSubmission> {
    const { assignment } = await this.assertAccess(tenantId, collaboratorId, assignmentId, asOf);
    if (!Object.values(SubmissionKind).includes(dto.kind)) throw new BadRequestException('A valid submission kind is required');
    const submission = await this.submissionRepo.save(this.submissionRepo.create({
      tenantId, assignmentId, collaboratorId, kind: dto.kind, payload: dto.payload ?? {}, status: SubmissionStatus.SUBMITTED,
    }));
    assignment.status = AssignmentStatus.SUBMITTED;
    await this.assignmentRepo.save(assignment);
    await this.automation?.emit(tenantId, 'collaborator.submission_received', {
      submissionId: submission.id, collaboratorId, kind: dto.kind, resourceType: assignment.resourceType, resourceId: assignment.resourceId,
    });
    return submission;
  }

  listSubmissions(tenantId: string, filter: { assignmentId?: string; collaboratorId?: string; status?: SubmissionStatus }): Promise<CollaboratorSubmission[]> {
    const where: any = { tenantId };
    if (filter.assignmentId) where.assignmentId = filter.assignmentId;
    if (filter.collaboratorId) where.collaboratorId = filter.collaboratorId;
    if (filter.status) where.status = filter.status;
    return this.submissionRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async reviewSubmission(tenantId: string, submissionId: string, dto: { accept: boolean; reviewedByUserId: string; note?: string }): Promise<CollaboratorSubmission> {
    const submission = await this.submissionRepo.findOne({ where: { id: submissionId, tenantId } });
    if (!submission) throw new NotFoundException(`Submission ${submissionId} not found`);
    if (submission.status !== SubmissionStatus.SUBMITTED) throw new BadRequestException('Only submitted items can be reviewed');
    submission.status = dto.accept ? SubmissionStatus.ACCEPTED : SubmissionStatus.REJECTED;
    submission.reviewedByUserId = dto.reviewedByUserId;
    if (dto.note) submission.note = dto.note;
    return this.submissionRepo.save(submission);
  }
}
