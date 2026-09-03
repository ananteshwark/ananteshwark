import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ConditionOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

export interface RuleCondition {
  field: string;          // dot-path into the event payload, e.g. "total" or "status"
  operator: ConditionOperator;
  value?: any;
}

export type RuleActionType = 'NOTIFY' | 'EMAIL' | 'WEBHOOK';

export interface RuleAction {
  type: RuleActionType;
  // NOTIFY: userId (fixed) or userIdField (dot-path into the payload); title/body templates
  // EMAIL: to (fixed) or toField; templateCode
  // WEBHOOK: event override (defaults to the trigger event)
  params: Record<string, any>;
}

/**
 * A tenant-configured automation: when `triggerEvent` fires and all
 * `conditions` match the payload, run every action. Rules never block the
 * business flow that emitted the event.
 */
@Entity('automation_rules')
@Index(['tenantId', 'triggerEvent'])
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @Column({ name: 'trigger_event', length: 100 })
  triggerEvent: string;

  @Column({ type: 'jsonb', default: [] })
  conditions: RuleCondition[];

  @Column({ type: 'jsonb', default: [] })
  actions: RuleAction[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'run_count', type: 'int', default: 0 })
  runCount: number;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
