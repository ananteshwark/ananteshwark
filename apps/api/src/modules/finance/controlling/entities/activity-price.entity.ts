import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('co_activity_prices')
@Index(['tenantId', 'activityTypeId', 'costCenterId', 'fiscalYear'], { unique: true })
export class ActivityPrice {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'activity_type_id', type: 'uuid' }) activityTypeId: string;
  @Column({ name: 'cost_center_id', type: 'uuid' }) costCenterId: string;
  @Column({ name: 'fiscal_year', type: 'int' }) fiscalYear: number;

  /** Total planned cost for the year (budget) */
  @Column({ name: 'planned_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  plannedCost: number;

  /** Total planned activity quantity for the year */
  @Column({ name: 'planned_qty', type: 'numeric', precision: 18, scale: 4, default: 1, transformer: decimalTransformer })
  plannedQty: number;

  /** Computed: plannedCost / plannedQty */
  @Column({ name: 'planned_rate', type: 'numeric', precision: 18, scale: 6, default: 0, transformer: decimalTransformer })
  plannedRate: number;

  /** Actual cost accumulated during the year (updated by activity confirmations) */
  @Column({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  actualCost: number;

  /** Actual activity quantity confirmed during the year */
  @Column({ name: 'actual_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  actualQty: number;

  /** Computed: actualCost / actualQty; recalculated on each confirmation */
  @Column({ name: 'actual_rate', type: 'numeric', precision: 18, scale: 6, default: 0, transformer: decimalTransformer })
  actualRate: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
