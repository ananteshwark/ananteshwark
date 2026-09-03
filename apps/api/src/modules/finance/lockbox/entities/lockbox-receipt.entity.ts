import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LockboxReceiptStatus {
  UNAPPLIED = 'UNAPPLIED',
  APPLIED = 'APPLIED',
  PARTIAL = 'PARTIAL',
  UNMATCHED = 'UNMATCHED', // could not resolve a customer
}

/**
 * Ph-114 — a single receipt parsed from a lockbox batch.
 * Stays in the unapplied queue until auto- or manually applied to invoices.
 */
@Entity('fin_lockbox_receipts')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'batchId'])
export class LockboxReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'batch_id', type: 'uuid' })
  batchId: string;

  @Column({ name: 'customer_ref', length: 100, nullable: true })
  customerRef: string | null; // raw reference from the file (code / name / invoice no)

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null; // resolved

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  amount: number;

  @Column({ name: 'applied_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  appliedAmount: number;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ length: 200, nullable: true })
  memo: string | null;

  @Column({ type: 'enum', enum: LockboxReceiptStatus, default: LockboxReceiptStatus.UNAPPLIED })
  status: LockboxReceiptStatus;

  @Column({ name: 'ar_receipt_id', type: 'uuid', nullable: true })
  arReceiptId: string | null; // link to created CustomerReceipt

  @Column({ name: 'match_note', length: 255, nullable: true })
  matchNote: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
