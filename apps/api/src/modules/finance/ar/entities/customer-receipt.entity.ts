import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ReceiptMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  CASH = 'CASH',
  CARD = 'CARD',
}

@Entity('fin_customer_receipts')
@Index(['tenantId', 'customerId'])
export class CustomerReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'receipt_number', length: 100 })
  receiptNumber: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'enum', enum: ReceiptMethod, default: ReceiptMethod.BANK_TRANSFER })
  method: ReceiptMethod;

  @Column({ length: 200, nullable: true })
  reference: string;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'unapplied_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  unappliedAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
