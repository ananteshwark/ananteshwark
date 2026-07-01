import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-246 — A period EVM measurement for a task: planned value, earned value,
 * actual cost, and the derived SPI/CPI.
 */
@Entity('pjt_evm_measurements')
@Index(['tenantId', 'projectId', 'period'])
@Index(['tenantId', 'projectId', 'taskId', 'period'], { unique: true })
export class EvmMeasurement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'task_id', type: 'varchar' })
  taskId: string;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ name: 'pct_scheduled', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  pctScheduled: number;

  @Column({ name: 'pct_complete', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  pctComplete: number;

  @Column({ name: 'planned_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  plannedValue: number; // PV / BCWS

  @Column({ name: 'earned_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  earnedValue: number; // EV / BCWP

  @Column({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  actualCost: number; // AC / ACWP

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true, transformer: decimalTransformer })
  spi: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 3, nullable: true, transformer: decimalTransformer })
  cpi: number | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
