import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WorkflowInstanceStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

@Entity('workflow_instances')
export class WorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'definition_id' })
  definitionId: string;

  @Column({ name: 'current_step', nullable: true })
  currentStep: string;

  @Column({
    type: 'enum',
    enum: WorkflowInstanceStatus,
    default: WorkflowInstanceStatus.PENDING,
  })
  status: WorkflowInstanceStatus;

  @Column({ name: 'initiator_id' })
  initiatorId: string;

  @Column({ name: 'subject_type' })
  subjectType: string;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @Column({ type: 'jsonb', default: {} })
  context: any;

  @Column({ type: 'jsonb', default: [] })
  history: Array<{
    stepId: string;
    action: string;
    userId: string;
    comment?: string;
    timestamp: string;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
