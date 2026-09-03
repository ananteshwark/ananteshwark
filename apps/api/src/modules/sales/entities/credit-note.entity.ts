import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CreditNoteStatus {
  DRAFT   = 'DRAFT',
  ISSUED  = 'ISSUED',
  APPLIED = 'APPLIED',
}

@Entity('so_credit_notes')
@Index(['tenantId', 'creditNoteNumber'], { unique: true })
export class CreditNote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'credit_note_number', length: 50 }) creditNoteNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'customer_name', length: 200, nullable: true }) customerName: string | null;
  @Column({ name: 'return_order_id', type: 'uuid', nullable: true }) returnOrderId: string | null;
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true }) invoiceId: string | null;

  @Column({ name: 'credit_date', type: 'date' }) creditDate: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ type: 'enum', enum: CreditNoteStatus, default: CreditNoteStatus.DRAFT }) status: CreditNoteStatus;

  @Column({ name: 'applied_to_invoice_id', type: 'uuid', nullable: true }) appliedToInvoiceId: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
