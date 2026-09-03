import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum JournalSource {
  MANUAL = 'MANUAL',
  AR = 'AR',
  AP = 'AP',
  BANK = 'BANK',
  PAYROLL = 'PAYROLL',
  PROCUREMENT = 'PROCUREMENT',
  FIXED_ASSETS = 'FIXED_ASSETS',
  SYSTEM = 'SYSTEM',
}

export enum JournalStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

@Entity('fin_journal_entries')
@Index(['entryNumber', 'tenantId'], { unique: true })
export class JournalEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'entry_number', length: 50 })
  entryNumber: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'period_id', type: 'uuid', nullable: true })
  periodId: string | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 200, nullable: true })
  reference: string;

  @Column({ type: 'enum', enum: JournalSource, default: JournalSource.MANUAL })
  source: JournalSource;

  @Column({ type: 'enum', enum: JournalStatus, default: JournalStatus.DRAFT })
  status: JournalStatus;

  @Column({
    name: 'total_debit',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalDebit: number;

  @Column({
    name: 'total_credit',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalCredit: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'posted_by_id', type: 'uuid', nullable: true })
  postedById: string | null;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt: Date | null;

  @Column({ name: 'reversed_entry_id', type: 'uuid', nullable: true })
  reversedEntryId: string | null;

  @Column({ name: 'ledger_code', length: 20, nullable: true, default: 'MAIN' })
  ledgerCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
