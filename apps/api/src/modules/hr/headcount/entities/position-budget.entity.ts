import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-191 — Time-phased approved headcount budget for a position: approved FTE,
 * grade, salary range, and effective period. A position may have one budget
 * per fiscal year.
 */
@Entity('hr_position_budgets')
@Index(['tenantId', 'positionId', 'fiscalYear'], { unique: true })
export class PositionBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'position_id', type: 'uuid' })
  positionId: string;

  @Column({ name: 'fiscal_year', type: 'int' })
  fiscalYear: number;

  @Column({ name: 'approved_fte', type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  approvedFte: number;

  @Column({ name: 'grade_id', type: 'uuid', nullable: true })
  gradeId: string | null;

  @Column({ name: 'salary_min', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  salaryMin: number;

  @Column({ name: 'salary_max', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  salaryMax: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'effective_from', type: 'date', nullable: true })
  effectiveFrom: string | null;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
