import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CollaboratorType {
  RECRUITER = 'RECRUITER',       // external recruiting agency
  BGV_VENDOR = 'BGV_VENDOR',     // background-verification vendor
  TRAVEL_AGENT = 'TRAVEL_AGENT', // external travel desk
}

export enum CollaboratorStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/**
 * A scoped external partner who collaborates on specific records only. Access
 * is record-level: a collaborator can act on a resource only via an explicit
 * assignment, and only while ACTIVE and within their access window.
 */
@Entity('ext_collaborators')
@Index(['tenantId', 'type'])
@Index(['tenantId', 'email'], { unique: true })
export class ExternalCollaborator {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: CollaboratorType }) type: CollaboratorType;
  @Column({ name: 'org_name', length: 200 }) orgName: string;
  @Column({ name: 'contact_name', length: 200, nullable: true }) contactName: string | null;
  @Column({ length: 200 }) email: string;
  @Column({ type: 'enum', enum: CollaboratorStatus, default: CollaboratorStatus.INVITED }) status: CollaboratorStatus;
  // Fine-grained capability scopes, e.g. ['job:submit_candidate','bgv:update_result'].
  @Column({ type: 'jsonb', default: () => "'[]'" }) scopes: string[];
  @Column({ name: 'invited_by_user_id', nullable: true }) invitedByUserId: string | null;
  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true }) activatedAt: Date | null;
  @Column({ name: 'access_expires_at', type: 'date', nullable: true }) accessExpiresAt: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum CollaboratorResourceType {
  JOB = 'JOB',
  BGV_CASE = 'BGV_CASE',
  TRAVEL_REQUEST = 'TRAVEL_REQUEST',
}

export enum AssignmentStatus {
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  CLOSED = 'CLOSED',
}

/** A record made visible to a collaborator — the unit of record-level scoping. */
@Entity('ext_collaborator_assignments')
@Index(['tenantId', 'collaboratorId'])
@Index(['tenantId', 'resourceType', 'resourceId'])
export class CollaboratorAssignment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'collaborator_id', type: 'uuid' }) collaboratorId: string;
  @Column({ name: 'resource_type', type: 'enum', enum: CollaboratorResourceType }) resourceType: CollaboratorResourceType;
  @Column({ name: 'resource_id', type: 'uuid' }) resourceId: string;
  @Column({ name: 'resource_label', length: 200, nullable: true }) resourceLabel: string | null;
  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.ASSIGNED }) status: AssignmentStatus;
  @Column({ name: 'assigned_by_user_id', nullable: true }) assignedByUserId: string | null;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum SubmissionKind {
  CANDIDATE = 'CANDIDATE',
  BGV_RESULT = 'BGV_RESULT',
  TRAVEL_QUOTE = 'TRAVEL_QUOTE',
}

export enum SubmissionStatus {
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

/** Something a collaborator submits against an assignment (a candidate, a check result, a quote). */
@Entity('ext_collaborator_submissions')
@Index(['tenantId', 'assignmentId'])
export class CollaboratorSubmission {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'assignment_id', type: 'uuid' }) assignmentId: string;
  @Column({ name: 'collaborator_id', type: 'uuid' }) collaboratorId: string;
  @Column({ type: 'enum', enum: SubmissionKind }) kind: SubmissionKind;
  @Column({ type: 'jsonb', default: () => "'{}'" }) payload: Record<string, any>;
  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.SUBMITTED }) status: SubmissionStatus;
  @Column({ name: 'reviewed_by_user_id', nullable: true }) reviewedByUserId: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
