import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ActionPlanStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * An action plan created off the back of an engagement/pulse survey to address
 * a low-scoring theme. Owned by a manager/HRBP with a target date and items.
 */
@Entity('ap_survey_action_plans')
@Index(['tenantId', 'status'])
export class SurveyActionPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'survey_id', type: 'uuid', nullable: true }) surveyId: string | null;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'focus_area', length: 120, nullable: true }) focusArea: string | null;
  @Column({ name: 'org_unit_id', type: 'uuid', nullable: true }) orgUnitId: string | null;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  @Column({ type: 'enum', enum: ActionPlanStatus, default: ActionPlanStatus.OPEN }) status: ActionPlanStatus;
  @Column({ name: 'target_date', type: 'date', nullable: true }) targetDate: string | null;
  // Survey drivers that motivated the plan, e.g. [{ theme:'Recognition', score:2.9 }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) drivers: Array<{ theme: string; score?: number }>;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum ActionItemStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  DONE = 'DONE',
}

@Entity('ap_action_items')
@Index(['tenantId', 'planId'])
export class ActionItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ length: 250 }) title: string;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ type: 'enum', enum: ActionItemStatus, default: ActionItemStatus.TODO }) status: ActionItemStatus;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum WatchStatus {
  WATCHING = 'WATCHING',
  ACTIONED = 'ACTIONED',
  RETAINED = 'RETAINED',
  EXITED = 'EXITED',
}

/**
 * An at-risk employee on the retention watchlist, seeded from a predictive
 * attrition score. Carries the risk band, drivers, and retention actions taken.
 */
@Entity('ap_attrition_watch')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'employeeId'], { unique: true })
export class AttritionWatch {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ name: 'risk_score', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  riskScore: number | null;
  @Column({ name: 'risk_band', length: 10, default: 'MEDIUM' }) riskBand: string; // LOW | MEDIUM | HIGH
  @Column({ type: 'jsonb', default: () => "'[]'" }) reasons: string[];
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  @Column({ type: 'enum', enum: WatchStatus, default: WatchStatus.WATCHING }) status: WatchStatus;
  // Retention actions taken, e.g. [{ action:'Comp review', at:'2026-07-01', by:'u1' }].
  @Column({ name: 'retention_actions', type: 'jsonb', default: () => "'[]'" })
  retentionActions: Array<{ action: string; at: string; by?: string }>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
