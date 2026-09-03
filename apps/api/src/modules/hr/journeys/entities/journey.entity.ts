import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum JourneyTrigger {
  ONBOARDING = 'ONBOARDING',
  OFFBOARDING = 'OFFBOARDING',
  PROMOTION = 'PROMOTION',
  RELOCATION = 'RELOCATION',
  LEAVE_RETURN = 'LEAVE_RETURN',
  ROLE_CHANGE = 'ROLE_CHANGE',
  PROBATION_END = 'PROBATION_END',
  CUSTOM = 'CUSTOM',
}

/**
 * A reusable journey template: an ordered set of steps that fire when a life-
 * cycle event occurs. Each step has an owner role and a due offset (days) from
 * the trigger anchor date.
 */
@Entity('hr_journey_templates')
@Index(['tenantId', 'triggerEvent'])
export class JourneyTemplate {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'trigger_event', type: 'enum', enum: JourneyTrigger, default: JourneyTrigger.CUSTOM })
  triggerEvent: JourneyTrigger;
  @Column({ default: true }) active: boolean;
  // Ordered steps, e.g. [{ key:'it_setup', title:'Provision laptop', ownerRole:'IT', offsetDays:-2, mandatory:true }].
  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: Array<{ key: string; title: string; ownerRole?: string; offsetDays?: number; mandatory?: boolean; instructions?: string }>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum JourneyStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('hr_journey_instances')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'status'])
export class JourneyInstance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'template_id', type: 'uuid' }) templateId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'trigger_event', type: 'enum', enum: JourneyTrigger }) triggerEvent: JourneyTrigger;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ name: 'anchor_date', type: 'date' }) anchorDate: string;
  @Column({ type: 'enum', enum: JourneyStatus, default: JourneyStatus.ACTIVE }) status: JourneyStatus;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum JourneyStepStatus {
  PENDING = 'PENDING',
  DONE = 'DONE',
  SKIPPED = 'SKIPPED',
}

@Entity('hr_journey_steps')
@Index(['tenantId', 'instanceId'])
export class JourneyStepInstance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'instance_id', type: 'uuid' }) instanceId: string;
  @Column({ length: 80 }) key: string;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'owner_role', length: 60, nullable: true }) ownerRole: string | null;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ default: true }) mandatory: boolean;
  @Column({ type: 'text', nullable: true }) instructions: string | null;
  @Column({ type: 'enum', enum: JourneyStepStatus, default: JourneyStepStatus.PENDING }) status: JourneyStepStatus;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
