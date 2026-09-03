import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BillStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  VOID = 'VOID',
}

@Entity('fin_bills')
@Index(['tenantId', 'vendorId'])
export class Bill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bill_number', length: 100 })
  billNumber: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'bill_date', type: 'date' })
  billDate: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({ type: 'enum', enum: BillStatus, default: BillStatus.DRAFT })
  status: BillStatus;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  taxAmount: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  total: number;

  @Column({ name: 'amount_paid', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amountPaid: number;

  @Column({ name: 'balance_due', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  balanceDue: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'base_currency', length: 10, nullable: true })
  baseCurrency: string | null;

  @Column({ name: 'exchange_rate', type: 'numeric', precision: 18, scale: 8, nullable: true, transformer: decimalTransformer })
  exchangeRate: number | null;

  @Column({ name: 'total_base', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  totalBase: number | null;

  @Column({ length: 200, nullable: true })
  reference: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  // Ph-104: AP withholding tax (TDS)
  @Column({ name: 'wht_code_id', type: 'uuid', nullable: true })
  whtCodeId: string | null;

  @Column({ name: 'wht_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  whtAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
