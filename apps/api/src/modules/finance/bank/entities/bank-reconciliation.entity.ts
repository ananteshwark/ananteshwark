import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ReconciliationStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('fin_bank_reconciliations')
@Index(['tenantId', 'bankAccountId'])
export class BankReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId: string;

  @Column({ name: 'statement_date', type: 'date' })
  statementDate: string;

  @Column({ name: 'statement_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  statementBalance: number;

  @Column({ name: 'book_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  bookBalance: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  difference: number;

  @Column({ type: 'enum', enum: ReconciliationStatus, default: ReconciliationStatus.IN_PROGRESS })
  status: ReconciliationStatus;

  @Column({ name: 'reconciled_by_id', type: 'uuid', nullable: true })
  reconciledById: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
