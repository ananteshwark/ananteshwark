import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ForecastBucket {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

/**
 * Ph-128/129 — Cash forecast snapshot header.
 * A persisted forecast can later be compared to actual cash movements
 * (variance analysis).
 */
@Entity('fin_cash_forecasts')
@Index(['tenantId', 'fromDate'])
export class CashForecast {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column({ type: 'enum', enum: ForecastBucket, default: ForecastBucket.WEEKLY })
  bucket: ForecastBucket;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  openingBalance: number;

  @Column({ name: 'forecast_inflow', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  forecastInflow: number;

  @Column({ name: 'forecast_outflow', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  forecastOutflow: number;

  @CreateDateColumn()
  createdAt: Date;
}

export enum ForecastCategory {
  AR_RECEIPT = 'AR_RECEIPT',
  AP_PAYMENT = 'AP_PAYMENT',
  PAYROLL = 'PAYROLL',
  INSTRUMENT_MATURITY = 'INSTRUMENT_MATURITY',
}

@Entity('fin_cash_forecast_lines')
@Index(['tenantId', 'forecastId'])
export class CashForecastLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'forecast_id', type: 'uuid' })
  forecastId: string;

  @Column({ name: 'period_key', length: 10 })
  periodKey: string; // bucket start date YYYY-MM-DD

  @Column({ type: 'enum', enum: ForecastCategory })
  category: ForecastCategory;

  /** Signed: inflows positive, outflows negative. */
  @Column({ name: 'forecast_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  forecastAmount: number;
}
