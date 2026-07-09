import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { HrCaseCategory, HrCasePriority } from './hr-case.entity';

export enum RoutingStrategy {
  ROUND_ROBIN = 'ROUND_ROBIN',
  LEAST_LOADED = 'LEAST_LOADED',
}

/**
 * Auto-assignment rule: new cases matching (category, priority) — null
 * matches any — are routed to an agent from the pool. Most specific active
 * rule wins (category+priority > category > priority > catch-all).
 * The rule's escalation contact receives cases that breach their SLA.
 */
@Entity('hd_routing_rules')
@Index(['tenantId', 'isActive'])
export class HrCaseRoutingRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'enum', enum: HrCaseCategory, nullable: true }) category: HrCaseCategory | null;
  @Column({ type: 'enum', enum: HrCasePriority, nullable: true }) priority: HrCasePriority | null;
  @Column({ name: 'agent_user_ids', type: 'jsonb' }) agentUserIds: string[];
  @Column({ type: 'enum', enum: RoutingStrategy, default: RoutingStrategy.ROUND_ROBIN })
  strategy: RoutingStrategy;
  @Column({ name: 'escalation_user_id', nullable: true }) escalationUserId: string | null;
  // Round-robin cursor — the index of the last agent assigned.
  @Column({ name: 'last_assigned_index', type: 'int', default: -1 }) lastAssignedIndex: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
