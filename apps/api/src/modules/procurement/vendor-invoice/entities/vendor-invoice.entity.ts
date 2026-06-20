import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum VendorInvoiceStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  MATCHED = 'MATCHED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
}

export enum InvoiceSource {
  MANUAL = 'MANUAL',
  VENDOR_PORTAL = 'VENDOR_PORTAL',
}

export enum MatchStatus {
  NOT_MATCHED = 'NOT_MATCHED',
  MATCHED = 'MATCHED',
  DISCREPANCY = 'DISCREPANCY',
}

@Entity('proc_vendor_invoices')
@Index(['invoiceNumber', 'tenantId'], { unique: true })
export class VendorInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'invoice_number', length: 50 })
  invoiceNumber: string;

  @Column({ name: 'vendor_invoice_ref', length: 200, nullable: true })
  vendorInvoiceRef: string | null;

  @Column({ name: 'vendor_id', type: 'varchar' })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200 })
  vendorName: string;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId: string | null;

  @Column({ name: 'grn_id', type: 'uuid', nullable: true })
  grnId: string | null;

  @Column({ name: 'invoice_date', type: 'date' })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  total: number;

  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  paidAmount: number;

  @Column({ type: 'enum', enum: VendorInvoiceStatus, default: VendorInvoiceStatus.DRAFT })
  status: VendorInvoiceStatus;

  @Column({ name: 'match_status', type: 'enum', enum: MatchStatus, default: MatchStatus.NOT_MATCHED })
  matchStatus: MatchStatus;

  @Column({ name: 'match_details', type: 'jsonb', nullable: true })
  matchDetails: Record<string, any> | null;

  @Column({ type: 'enum', enum: InvoiceSource, default: InvoiceSource.MANUAL })
  source: InvoiceSource;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
