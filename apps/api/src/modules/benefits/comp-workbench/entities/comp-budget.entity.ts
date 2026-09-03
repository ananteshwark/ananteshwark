import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum AwardType {
  MERIT = 'MERIT', // base salary increase
  BONUS = 'BONUS',
  EQUITY = 'EQUITY',
}

/**
 * Ph-182 — Compensation budget envelope per org unit and award type within a
 * merit cycle. Awards consume the envelope; the workbench blocks over-budget
 * allocations.
 */
@Entity('comp_budgets')
@Index(['tenantId', 'cycleId', 'orgUnitId', 'awardType'], { unique: true })
export class CompBudget {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'org_unit_id', type: 'uuid' })
  orgUnitId: string;

  @Column({ name: 'award_type', type: 'enum', enum: AwardType })
  awardType: AwardType;

  @Column({ name: 'budget_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  budgetAmount: number;

  @Column({ name: 'allocated_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  allocatedAmount: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
