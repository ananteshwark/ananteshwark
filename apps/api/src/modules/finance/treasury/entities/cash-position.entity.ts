import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_cash_positions')
@Index(['tenantId', 'bankAccountId', 'snapshotDate'], { unique: true })
export class CashPosition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'bank_account_id', type: 'uuid' }) bankAccountId: string;
  @Column({ name: 'snapshot_date', type: 'date' }) snapshotDate: string;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) openingBalance: number;
  @Column({ name: 'inflow_forecast', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) inflowForecast: number;
  @Column({ name: 'outflow_forecast', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) outflowForecast: number;
  @Column({ name: 'closing_balance', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) closingBalance: number;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
