import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Phase 51 — Budget vs Actual + Commitment Accounting.
 * A granular budget line keyed by fiscal year / period / GL account / cost center.
 * Kept separate from the analytics `Budget` (jsonb-based) entity so we can run
 * relational aggregation against GL journal lines and open PO commitments.
 */
@Entity('fin_budget_lines')
@Index(['tenantId', 'fiscalYear'])
@Index(['tenantId', 'glAccountId'])
@Index(['tenantId', 'costCenterId'])
export class BudgetLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  /** Optional link back to an analytics Budget header. */
  @Column({ name: 'budget_id', type: 'uuid', nullable: true })
  budgetId: string | null;

  @Column({ name: 'fiscal_year', type: 'int' })
  fiscalYear: number;

  /** 'YYYY-MM' for a monthly budget, or null for an annual line. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  period: string | null;

  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true })
  glAccountId: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
