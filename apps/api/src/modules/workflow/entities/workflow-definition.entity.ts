import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'notification' | 'condition' | 'action';
  approvers?: Array<{ type: 'role' | 'user' | 'manager'; value: string }>;
  condition?: string;
  timeoutHours?: number;
  escalationAfterHours?: number;
  onApproveNext?: string;
  onRejectNext?: string;
}

@Entity('workflow_definitions')
export class WorkflowDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'trigger_module', length: 100 })
  triggerModule: string;

  @Column({ name: 'trigger_event', length: 100 })
  triggerEvent: string;

  @Column({ type: 'jsonb', default: [] })
  steps: WorkflowStep[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ default: 1 })
  version: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
