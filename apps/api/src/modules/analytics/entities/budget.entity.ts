import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum BudgetStatus {
  DRAFT    = 'DRAFT',
  APPROVED = 'APPROVED',
  ACTIVE   = 'ACTIVE',
  CLOSED   = 'CLOSED',
}

@Entity('ana_budgets')
@Index(['tenantId', 'name', 'fiscalYear'], { unique: true })
export class Budget {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ name: 'fiscal_year', type: 'int' }) fiscalYear: number;
  @Column({ type: 'enum', enum: BudgetStatus, default: BudgetStatus.DRAFT }) status: BudgetStatus;
  @Column({ type: 'jsonb', default: [] }) lines: Array<{ accountCode: string; accountName: string; period: string; budgetAmount: number; notes?: string }>;
  @Column({ name: 'total_budget', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalBudget: number;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
