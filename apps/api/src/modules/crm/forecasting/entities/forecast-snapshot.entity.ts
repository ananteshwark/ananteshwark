import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-216 — A point-in-time commit/best-case snapshot per owner+period, used to
 * measure forecast accuracy against actual bookings.
 */
@Entity('crm_forecast_snapshots')
@Index(['tenantId', 'ownerId', 'period', 'snapshotDate'])
export class ForecastSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'owner_id', type: 'varchar' })
  ownerId: string;

  @Column({ length: 7 })
  period: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate: string;

  @Column({ name: 'commit_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  commitAmount: number;

  @Column({ name: 'best_case_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  bestCaseAmount: number;

  @Column({ name: 'pipeline_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  pipelineAmount: number;

  @CreateDateColumn() createdAt: Date;
}
