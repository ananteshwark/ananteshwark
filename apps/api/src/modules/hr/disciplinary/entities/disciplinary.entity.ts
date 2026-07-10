import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DisciplinaryType {
  MISCONDUCT = 'MISCONDUCT',
  PERFORMANCE = 'PERFORMANCE',
  ATTENDANCE = 'ATTENDANCE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  OTHER = 'OTHER',
}

export enum DisciplinarySeverity {
  MINOR = 'MINOR',
  MAJOR = 'MAJOR',
  GROSS = 'GROSS',
}

export enum DisciplinaryStatus {
  OPEN = 'OPEN',
  UNDER_INVESTIGATION = 'UNDER_INVESTIGATION',
  HEARING = 'HEARING',
  DECISION = 'DECISION',
  CLOSED = 'CLOSED',
  APPEALED = 'APPEALED',
}

// Progressive-discipline ladder, ordered from lightest to most severe.
export enum DisciplinaryStage {
  NONE = 'NONE',
  VERBAL_WARNING = 'VERBAL_WARNING',
  WRITTEN_WARNING = 'WRITTEN_WARNING',
  FINAL_WARNING = 'FINAL_WARNING',
  SUSPENSION = 'SUSPENSION',
  TERMINATION = 'TERMINATION',
}

@Entity('hr_disciplinary_cases')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'status'])
export class DisciplinaryCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ name: 'case_type', type: 'enum', enum: DisciplinaryType, default: DisciplinaryType.MISCONDUCT }) caseType: DisciplinaryType;
  @Column({ type: 'enum', enum: DisciplinarySeverity, default: DisciplinarySeverity.MINOR }) severity: DisciplinarySeverity;
  @Column({ type: 'enum', enum: DisciplinaryStatus, default: DisciplinaryStatus.OPEN }) status: DisciplinaryStatus;
  @Column({ name: 'current_stage', type: 'enum', enum: DisciplinaryStage, default: DisciplinaryStage.NONE }) currentStage: DisciplinaryStage;
  @Column({ type: 'text' }) description: string;
  @Column({ name: 'raised_by_user_id', nullable: true }) raisedByUserId: string | null;
  @Column({ default: true }) confidential: boolean;
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true }) closedAt: Date | null;
  @Column({ name: 'outcome', type: 'text', nullable: true }) outcome: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A formal action issued on a case (a warning, suspension, etc.). Warnings can
 * carry a validity window used by the active-warnings roll-up.
 */
@Entity('hr_disciplinary_actions')
@Index(['tenantId', 'caseId'])
@Index(['tenantId', 'employeeId'])
export class DisciplinaryAction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_id', type: 'uuid' }) caseId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'action_stage', type: 'enum', enum: DisciplinaryStage }) actionStage: DisciplinaryStage;
  @Column({ name: 'issued_by_user_id', nullable: true }) issuedByUserId: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ default: false }) acknowledged: boolean;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum CaseEventKind {
  NOTE = 'NOTE',
  INVESTIGATION = 'INVESTIGATION',
  HEARING_SCHEDULED = 'HEARING_SCHEDULED',
  EVIDENCE = 'EVIDENCE',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

/** An immutable timeline entry on a disciplinary case. */
@Entity('hr_disciplinary_events')
@Index(['tenantId', 'caseId'])
export class DisciplinaryEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_id', type: 'uuid' }) caseId: string;
  @Column({ type: 'enum', enum: CaseEventKind, default: CaseEventKind.NOTE }) kind: CaseEventKind;
  @Column({ type: 'text' }) detail: string;
  @Column({ name: 'by_user_id', nullable: true }) byUserId: string | null;
  @CreateDateColumn() createdAt: Date;
}
