import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';
import { AwardType } from './comp-budget.entity';

export enum AwardStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED', // pending manager approval
  HR_REVIEW = 'HR_REVIEW',
  FINANCE_REVIEW = 'FINANCE_REVIEW',
  APPROVED = 'APPROVED', // locked
  REJECTED = 'REJECTED',
}

/**
 * Ph-183/184/185 — A proposed compensation award for an employee within a
 * cycle, consuming a budget envelope, progressing through a
 * manager → HR → finance approval workflow, then locked.
 */
@Entity('comp_awards')
@Index(['tenantId', 'cycleId', 'status'])
@Index(['tenantId', 'employeeId'])
export class CompAward {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'org_unit_id', type: 'uuid' })
  orgUnitId: string;

  @Column({ name: 'award_type', type: 'enum', enum: AwardType })
  awardType: AwardType;

  @Column({ name: 'current_salary', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  currentSalary: number;

  @Column({ name: 'performance_rating', length: 20, nullable: true })
  performanceRating: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'enum', enum: AwardStatus, default: AwardStatus.DRAFT })
  status: AwardStatus;

  @Column({ name: 'assignment_change_id', type: 'uuid', nullable: true })
  assignmentChangeId: string | null; // set on execution (Ph-185)

  @Column({ name: 'approval_history', type: 'jsonb', default: [] })
  approvalHistory: Array<{ stage: string; userId: string; action: string; at: string }>;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
