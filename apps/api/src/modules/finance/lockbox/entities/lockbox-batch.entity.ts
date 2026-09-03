import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LockboxFormat {
  MT940 = 'MT940',
  BAI2 = 'BAI2',
  NORMALIZED = 'NORMALIZED',
}

export enum LockboxBatchStatus {
  PARSED = 'PARSED',
  APPLIED = 'APPLIED',
  PARTIAL = 'PARTIAL',
}

/**
 * Ph-112 — Lockbox import batch header.
 * Oracle equivalent: AR Lockbox transmission.
 */
@Entity('fin_lockbox_batches')
@Index(['tenantId', 'status'])
export class LockboxBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'batch_number', length: 40 })
  batchNumber: string;

  @Column({ type: 'enum', enum: LockboxFormat })
  format: LockboxFormat;

  @Column({ type: 'enum', enum: LockboxBatchStatus, default: LockboxBatchStatus.PARSED })
  status: LockboxBatchStatus;

  @Column({ name: 'receipt_count', type: 'int', default: 0 })
  receiptCount: number;

  @Column({ name: 'total_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'applied_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  appliedAmount: number;

  @Column({ name: 'file_reference', length: 200, nullable: true })
  fileReference: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
