import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum HrCaseCategory {
  PAYROLL    = 'PAYROLL',
  LEAVE      = 'LEAVE',
  ATTENDANCE = 'ATTENDANCE',
  BENEFITS   = 'BENEFITS',
  POLICY     = 'POLICY',
  DOCUMENTS  = 'DOCUMENTS',
  GRIEVANCE  = 'GRIEVANCE',
  IT         = 'IT',
  FACILITIES = 'FACILITIES',
  OTHER      = 'OTHER',
}

export enum HrCasePriority {
  LOW    = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH   = 'HIGH',
  URGENT = 'URGENT',
}

export enum HrCaseStatus {
  OPEN        = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD     = 'ON_HOLD',
  RESOLVED    = 'RESOLVED',
  CLOSED      = 'CLOSED',
}

@Entity('hd_cases')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'caseNumber'], { unique: true })
export class HrCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_number', length: 20 }) caseNumber: string;
  @Column({ name: 'employee_id', nullable: true }) employeeId: string | null;
  @Column() subject: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'enum', enum: HrCaseCategory, default: HrCaseCategory.OTHER }) category: HrCaseCategory;
  @Column({ type: 'enum', enum: HrCasePriority, default: HrCasePriority.MEDIUM }) priority: HrCasePriority;
  @Column({ type: 'enum', enum: HrCaseStatus, default: HrCaseStatus.OPEN }) status: HrCaseStatus;
  // Grievances are confidential by default: visible only to helpdesk managers.
  @Column({ default: false }) confidential: boolean;
  @Column({ name: 'assigned_to_id', nullable: true }) assignedToId: string | null;
  @Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true }) slaDueAt: Date | null;
  @Column({ name: 'resolution_notes', type: 'text', nullable: true }) resolutionNotes: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  // SLA escalation stamp — set once by the overdue sweep.
  @Column({ name: 'escalated_at', type: 'timestamptz', nullable: true }) escalatedAt: Date | null;
  // Closure feedback (CSAT) from the requester, 1-5.
  @Column({ name: 'csat_score', type: 'int', nullable: true }) csatScore: number | null;
  @Column({ name: 'csat_comment', type: 'text', nullable: true }) csatComment: string | null;
  @Column({ name: 'created_by_user_id' }) createdByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('hd_case_comments')
@Index(['tenantId', 'caseId'])
export class HrCaseComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_id' }) caseId: string;
  @Column({ name: 'author_user_id' }) authorUserId: string;
  @Column({ name: 'author_name' }) authorName: string;
  @Column({ type: 'text' }) body: string;
  // Internal notes are visible to the HR team only, not the requester.
  @Column({ default: false }) internal: boolean;
  @CreateDateColumn() createdAt: Date;
}
