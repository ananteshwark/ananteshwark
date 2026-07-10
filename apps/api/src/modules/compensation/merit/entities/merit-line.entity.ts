import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum MeritLineStatus {
  PENDING = 'PENDING',     // awaiting a manager proposal
  PROPOSED = 'PROPOSED',   // manager entered an increment
  APPROVED = 'APPROVED',   // passed all approvals
  REJECTED = 'REJECTED',
}

/**
 * One worksheet line = one eligible employee in the plan. Managers propose an
 * increment; the engine computes the new salary, compa-ratio, and any alerts
 * (bias, discretion breach, budget overrun, pay-range breach).
 */
@Entity('cmp_merit_lines')
@Index(['tenantId', 'planId'])
@Index(['tenantId', 'budgetId'])
export class MeritLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ name: 'budget_id', type: 'uuid', nullable: true }) budgetId: string | null;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'current_salary', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  currentSalary: number;
  @Column({ name: 'performance_rating', length: 30, nullable: true }) performanceRating: string | null;
  // Salary-range midpoint used to compute compa-ratio (optional).
  @Column({ name: 'range_midpoint', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  rangeMidpoint: number | null;
  // Manager's proposed increment.
  @Column({ name: 'proposed_pct', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  proposedPct: number;
  @Column({ name: 'proposed_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  proposedAmount: number;
  @Column({ name: 'new_salary', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  newSalary: number;
  @Column({ name: 'new_compa_ratio', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: decimalTransformer })
  newCompaRatio: number | null;
  // Optional demographic attribute used for bias screening (e.g. gender).
  @Column({ name: 'demographic', length: 40, nullable: true }) demographic: string | null;
  // Alerts raised on this line at the last recompute.
  @Column({ type: 'jsonb', default: () => "'[]'" }) alerts: Array<{ type: string; detail: string }>;
  @Column({ type: 'enum', enum: MeritLineStatus, default: MeritLineStatus.PENDING }) status: MeritLineStatus;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
