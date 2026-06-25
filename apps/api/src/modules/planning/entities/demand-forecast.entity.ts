import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ForecastMethod {
  MOVING_AVERAGE = 'MOVING_AVERAGE',
  WEIGHTED_MOVING_AVERAGE = 'WEIGHTED_MOVING_AVERAGE',
  EXPONENTIAL_SMOOTHING = 'EXPONENTIAL_SMOOTHING',
  MANUAL = 'MANUAL',
}

export enum ForecastStatus {
  DRAFT = 'DRAFT',
  RELEASED = 'RELEASED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * A demand forecast (sales & operations plan) for a single item. The chosen
 * statistical method is applied to historical sales to project demand across
 * `horizonPeriods` future months. Releasing the forecast turns its periods into
 * planned independent requirements that supply planning can consume.
 */
@Entity('scm_demand_forecasts')
@Index(['tenantId', 'itemId'])
export class DemandForecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'item_name', length: 200, nullable: true })
  itemName: string | null;

  @Column({ type: 'enum', enum: ForecastMethod })
  method: ForecastMethod;

  /** Months of history used as the model input. */
  @Column({ name: 'history_months', type: 'int', default: 12 })
  historyMonths: number;

  /** Number of future months projected. */
  @Column({ name: 'horizon_periods', type: 'int', default: 6 })
  horizonPeriods: number;

  /** Method parameters: { windowSize?, weights?: number[], alpha? }. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  parameters: Record<string, any>;

  @Column({ type: 'enum', enum: ForecastStatus, default: ForecastStatus.DRAFT })
  status: ForecastStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
