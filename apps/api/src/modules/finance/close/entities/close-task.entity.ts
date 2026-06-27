import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum CloseTaskType {
  RECONCILIATION = 'RECONCILIATION',
  JOURNAL = 'JOURNAL',
  REPORT = 'REPORT',
  ACCRUAL = 'ACCRUAL',
  REVIEW = 'REVIEW',
  OTHER = 'OTHER',
}

export enum CloseTaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  PREPARED = 'PREPARED',
  CERTIFIED = 'CERTIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Ph-131 — Period-close task.
 * Oracle ARCS equivalent: a reconciliation/close task assigned to a preparer
 * and reviewer with a due date and certification workflow.
 */
@Entity('fin_close_tasks')
@Index(['tenantId', 'periodId', 'status'])
export class CloseTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'task_type', type: 'enum', enum: CloseTaskType, default: CloseTaskType.OTHER })
  taskType: CloseTaskType;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @Column({ name: 'preparer_id', type: 'uuid', nullable: true })
  preparerId: string | null;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'enum', enum: CloseTaskStatus, default: CloseTaskStatus.OPEN })
  status: CloseTaskStatus;

  @Column({ name: 'sequence', type: 'int', default: 0 })
  sequence: number;

  @Column({ name: 'prepared_at', type: 'timestamp', nullable: true })
  preparedAt: Date | null;

  @Column({ name: 'certified_at', type: 'timestamp', nullable: true })
  certifiedAt: Date | null;

  @Column({ name: 'reject_reason', type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
