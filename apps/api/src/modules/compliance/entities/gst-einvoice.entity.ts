import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum GstEInvoiceStatus {
  GENERATED = 'GENERATED',
  TRANSMITTED = 'TRANSMITTED',
  CANCELLED = 'CANCELLED',
}

/**
 * E-invoice register: one row per AR invoice reported to the Invoice
 * Registration Portal (IRP). Stores the exact INV-01 payload and the IRN so
 * the reported document is reproducible for audits.
 */
@Entity('gst_einvoices')
@Index(['tenantId', 'invoiceId'], { unique: true })
export class GstEInvoice {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'invoice_id' }) invoiceId: string;
  @Column({ name: 'invoice_number' }) invoiceNumber: string;
  // Invoice Reference Number: SHA-256 over supplier GSTIN + FY + doc type + doc number.
  @Column({ length: 64 }) irn: string;
  @Column({ type: 'enum', enum: GstEInvoiceStatus, default: GstEInvoiceStatus.GENERATED })
  status: GstEInvoiceStatus;
  @Column({ type: 'jsonb' }) payload: Record<string, any>;
  // IRP acknowledgement, populated when the register entry is transmitted.
  @Column({ name: 'ack_no', length: 30, nullable: true }) ackNo: string | null;
  @Column({ name: 'ack_date', length: 30, nullable: true }) ackDate: string | null;
  @Column({ name: 'transmitted_at', type: 'timestamptz', nullable: true }) transmittedAt: Date | null;
  @Column({ name: 'cancel_reason', type: 'text', nullable: true }) cancelReason: string | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
