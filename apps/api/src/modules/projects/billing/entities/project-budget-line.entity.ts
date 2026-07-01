import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-237 — A budget line by task / resource / GL account.
 */
@Entity('pjt_budget_lines')
@Index(['tenantId', 'budgetId'])
@Index(['tenantId', 'projectId'])
export class ProjectBudgetLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'budget_id', type: 'uuid' })
  budgetId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ name: 'resource_id', type: 'varchar', nullable: true })
  resourceId: string | null;

  @Column({ name: 'gl_account_code', length: 40, nullable: true })
  glAccountCode: string | null;

  @Column({ name: 'budget_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  budgetAmount: number;

  @Column({ name: 'budget_hours', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: decimalTransformer })
  budgetHours: number;

  @CreateDateColumn() createdAt: Date;
}
