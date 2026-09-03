import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * A single projected month of a demand forecast. `forecastQty` is the
 * statistical output; a planner may override it with `adjustedQty`. Once the
 * month elapses `actualQty` captures realised demand for accuracy tracking.
 * `finalQty` (adjusted ?? forecast) is what supply planning consumes.
 */
@Entity('scm_forecast_periods')
@Index(['tenantId', 'forecastId'])
@Index(['tenantId', 'itemId', 'periodLabel'])
export class ForecastPeriod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'forecast_id', type: 'uuid' })
  forecastId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  /** First day of the forecast month. */
  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  /** YYYY-MM label. */
  @Column({ name: 'period_label', length: 7 })
  periodLabel: string;

  @Column({
    name: 'forecast_qty',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  forecastQty: number;

  @Column({
    name: 'adjusted_qty',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  adjustedQty: number | null;

  @Column({
    name: 'actual_qty',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  actualQty: number | null;

  @Column({ name: 'released_to_supply', default: false })
  releasedToSupply: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
