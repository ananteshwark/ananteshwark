import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-197 — Processed, payroll-ready timecard for an employee over a period.
 * `elements` is the per-pay-element breakdown payroll consumes.
 */
@Entity('otl_timecard_results')
@Index(['tenantId', 'employeeId', 'periodStart'], { unique: true })
export class OtlTimecardResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'regular_hours', type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  regularHours: number;

  @Column({ name: 'overtime_hours', type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  overtimeHours: number;

  @Column({ name: 'premium_hours', type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  premiumHours: number;

  /** [{ code, hours, multiplier }] — payroll-ready pay-element lines. */
  @Column({ type: 'jsonb', default: [] })
  elements: Array<{ code: string; hours: number; multiplier: number }>;

  @Column({ length: 20, default: 'PROCESSED' })
  status: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
