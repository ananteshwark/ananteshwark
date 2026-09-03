import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AutomationRunStatus {
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

/** Execution log: one row per rule firing (or per scheduler sweep finding). */
@Entity('automation_runs')
@Index(['tenantId', 'createdAt'])
export class AutomationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'rule_id', nullable: true })
  ruleId: string | null;

  @Column({ name: 'rule_name', nullable: true })
  ruleName: string | null;

  @Column({ length: 100 })
  event: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, any>;

  @Column({ type: 'enum', enum: AutomationRunStatus, default: AutomationRunStatus.SUCCESS })
  status: AutomationRunStatus;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
