import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BudgetStatus {
  BASELINE = 'BASELINE',
  REVISED = 'REVISED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Ph-237 — A project budget version. The latest non-archived version is the
 * active budget; earlier versions are kept as the baseline/revision history.
 */
@Entity('pjt_budgets')
@Index(['tenantId', 'projectId', 'version'], { unique: true })
export class ProjectBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'enum', enum: BudgetStatus, default: BudgetStatus.BASELINE })
  status: BudgetStatus;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
