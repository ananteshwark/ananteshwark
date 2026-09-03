import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ApprovalTaskStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED',
  SKIPPED = 'SKIPPED',
}

/**
 * Ph-256/257/258 — An approval task for one approver within a stage.
 */
@Entity('bpm_approval_tasks')
@Index(['tenantId', 'instanceId', 'stageIndex'])
@Index(['tenantId', 'assignedTo', 'status'])
export class ApprovalTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId: string;

  @Column({ name: 'stage_index', type: 'int' })
  stageIndex: number;

  @Column({ name: 'stage_id', length: 60 })
  stageId: string;

  @Column({ length: 10 })
  mode: string; // ALL / ANY

  @Column({ name: 'assigned_to', type: 'varchar' })
  assignedTo: string;

  @Column({ name: 'original_assignee', type: 'varchar' })
  originalAssignee: string;

  @Column({ type: 'enum', enum: ApprovalTaskStatus, default: ApprovalTaskStatus.PENDING })
  status: ApprovalTaskStatus;

  @Column({ name: 'due_at', type: 'timestamp', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'decided_at', type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
