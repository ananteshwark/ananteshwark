import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum RecurringFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

@Entity('fin_recurring_journals')
@Index(['tenantId', 'isActive', 'nextRunDate'])
export class RecurringJournal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ type: 'enum', enum: RecurringFrequency, default: RecurringFrequency.MONTHLY }) frequency: RecurringFrequency;

  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date', nullable: true }) endDate: string | null;
  @Column({ name: 'next_run_date', type: 'date' }) nextRunDate: string;
  @Column({ name: 'last_run_date', type: 'date', nullable: true }) lastRunDate: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;

  @Column({ name: 'ledger_code', length: 20, nullable: true, default: 'MAIN' }) ledgerCode: string | null;

  @Column({ type: 'jsonb', default: [] }) templateLines: Array<{
    accountId: string;
    costCenterId?: string | null;
    profitCenterId?: string | null;
    internalOrderId?: string | null;
    debit: number;
    credit: number;
    description?: string;
  }>;

  @Column({ name: 'total_debit', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalDebit: number;
  @Column({ name: 'total_credit', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalCredit: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
