import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, VersionColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ExpenseClaimStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('exp_claims')
@Index(['tenantId', 'claimNumber'], { unique: true })
export class ExpenseClaim {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'claim_number', length: 50 }) claimNumber: string;
  @Column({ name: 'employee_id', type: 'varchar' }) employeeId: string;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'claim_date', type: 'date' }) claimDate: string;
  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalAmount: number;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'enum', enum: ExpenseClaimStatus, default: ExpenseClaimStatus.DRAFT }) status: ExpenseClaimStatus;
  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true }) paidAt: Date | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true }) rejectionReason: string | null;
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  // Split provenance: claims carved out for colleagues point at the original.
  @Column({ name: 'split_from_claim_id', type: 'uuid', nullable: true }) splitFromClaimId: string | null;
  // Advance settlement: deduction applied before payout (net = total - deduction).
  @Column({ name: 'advance_id', type: 'varchar', nullable: true }) advanceId: string | null;
  @Column({ name: 'advance_deduction', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  advanceDeduction: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;

  // Optimistic concurrency counter: clients echo it back on update;
  // a stale value is rejected with 409 instead of last-write-wins.
  @VersionColumn({ default: 1 })
  version: number;
}
