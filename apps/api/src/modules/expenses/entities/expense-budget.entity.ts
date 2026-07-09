import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * Yearly spend budget per expense category (categoryId null = all categories).
 * Approval-time consumption crossing alertThresholdPct emits
 * `expense.budget_alert` so tenants can attach notification rules.
 */
@Entity('exp_budgets')
@Index(['tenantId', 'year'])
export class ExpenseBudget {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null;
  @Column({ type: 'int' }) year: number;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ name: 'alert_threshold_pct', type: 'int', default: 80 }) alertThresholdPct: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
