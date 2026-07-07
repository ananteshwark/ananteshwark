import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index, VersionColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PoStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  RELEASED = 'RELEASED',
  SENT = 'SENT',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  INVOICED = 'INVOICED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

@Entity('proc_purchase_orders')
@Index(['poNumber', 'tenantId'], { unique: true })
export class PurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'po_number', length: 50 })
  poNumber: string;

  @Column({ name: 'rfq_id', type: 'uuid', nullable: true })
  rfqId: string | null;

  @Column({ name: 'requisition_id', type: 'uuid', nullable: true })
  requisitionId: string | null;

  // Phase 32: optional link to a framework / outline agreement
  @Column({ name: 'outline_agreement_id', type: 'uuid', nullable: true })
  outlineAgreementId: string | null;

  @Column({ name: 'vendor_id', type: 'varchar' })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200 })
  vendorName: string;

  @Column({ name: 'po_date', type: 'date' })
  poDate: string;

  @Column({ name: 'delivery_date', type: 'date', nullable: true })
  deliveryDate: string | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
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
    default: 0,
    transformer: decimalTransformer,
  })
  total: number;

  @Column({
    name: 'amount_received',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amountReceived: number;

  @Column({ type: 'enum', enum: PoStatus, default: PoStatus.DRAFT })
  status: PoStatus;

  @Column({ name: 'approval_matrix', type: 'jsonb', nullable: true })
  approvalMatrix: Record<string, any> | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'terms_conditions', type: 'text', nullable: true })
  termsConditions: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'released_by_id', type: 'uuid', nullable: true })
  releasedById: string | null;

  @Column({ name: 'current_approval_level', type: 'int', default: 0 })
  currentApprovalLevel: number;

  @Column({ name: 'approval_history', type: 'jsonb', nullable: true })
  approvalHistory: Array<{
    level: number;
    approverId: string;
    approverName: string;
    action: string;
    comments?: string;
    actionedAt: string;
  }> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Optimistic concurrency counter: clients echo it back on update;
  // a stale value is rejected with 409 instead of last-write-wins.
  @VersionColumn({ default: 1 })
  version: number;
}
