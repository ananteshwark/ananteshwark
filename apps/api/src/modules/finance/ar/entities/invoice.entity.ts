import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('invoices')
@Index(['tenantId', 'invoiceNumber'])
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'invoice_number', length: 100 })
  invoiceNumber: string;

  @Column({ name: 'customer_name', length: 255 })
  customerName: string;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ name: 'sub_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  subTotal: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'tax_code_id', nullable: true })
  taxCodeId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
