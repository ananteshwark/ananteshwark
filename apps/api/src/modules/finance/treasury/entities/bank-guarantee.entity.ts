import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BankGuaranteeStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CLAIMED = 'CLAIMED',
  RELEASED = 'RELEASED',
}

@Entity('fin_bank_guarantees')
@Index(['tenantId', 'referenceNumber'], { unique: true })
export class BankGuarantee {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'reference_number', length: 100 }) referenceNumber: string;
  @Column({ length: 200 }) beneficiary: string;
  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true }) bankAccountId: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'issue_date', type: 'date' }) issueDate: string;
  @Column({ name: 'expiry_date', type: 'date' }) expiryDate: string;
  @Column({ type: 'enum', enum: BankGuaranteeStatus, default: BankGuaranteeStatus.ACTIVE }) status: BankGuaranteeStatus;
  @Column({ type: 'text', nullable: true }) purpose: string | null;
  @Column({ name: 'claimed_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) claimedAmount: number | null;
  @Column({ name: 'claimed_at', type: 'timestamp', nullable: true }) claimedAt: Date | null;
  @Column({ name: 'released_at', type: 'timestamp', nullable: true }) releasedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
