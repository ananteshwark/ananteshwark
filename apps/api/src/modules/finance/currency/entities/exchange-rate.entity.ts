import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Monthly conversion rate from one currency to another. A rate is keyed by
 * (tenant, from, to, year, month) so finance can maintain a fresh set of
 * conversion rates each month.
 */
@Entity('fin_exchange_rates')
@Index(['tenantId', 'fromCurrency', 'toCurrency', 'year', 'month'], { unique: true })
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'from_currency', length: 10 })
  fromCurrency: string;

  @Column({ name: 'to_currency', length: 10 })
  toCurrency: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 8,
    transformer: decimalTransformer,
  })
  rate: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
