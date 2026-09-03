import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { InvoiceLineItem } from './invoice-line-item.entity';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

@Entity('lic_invoices')
@Index(['tenantId'])
export class LicenseInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id' })
  contractId: string;

  @Column({ name: 'invoice_number', length: 50 })
  invoiceNumber: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  taxAmount: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  discountAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  totalAmount: number;

  @Column({
    name: 'tax_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalTransformer,
    default: 0,
  })
  taxRate: number;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @OneToMany(() => InvoiceLineItem, (item) => item.invoice, { cascade: true })
  lineItems: InvoiceLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
