import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum InstrumentType {
  DEPOSIT = 'DEPOSIT',
  T_BILL = 'T_BILL',
  COMMERCIAL_PAPER = 'COMMERCIAL_PAPER',
  OTHER = 'OTHER',
}

export enum InstrumentStatus {
  ACTIVE = 'ACTIVE',
  MATURED = 'MATURED',
  REDEEMED = 'REDEEMED',
}

@Entity('fin_financial_instruments')
@Index(['tenantId', 'referenceNumber'], { unique: true })
export class FinancialInstrument {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'reference_number', length: 100 }) referenceNumber: string;
  @Column({ type: 'enum', enum: InstrumentType }) type: InstrumentType;
  @Column({ type: 'enum', enum: InstrumentStatus, default: InstrumentStatus.ACTIVE }) status: InstrumentStatus;
  @Column({ length: 200 }) counterparty: string;
  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true }) bankAccountId: string | null;
  @Column({ name: 'face_value', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) faceValue: number;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'interest_rate', type: 'numeric', precision: 8, scale: 6, transformer: decimalTransformer }) interestRate: number;
  @Column({ name: 'purchase_date', type: 'date' }) purchaseDate: string;
  @Column({ name: 'maturity_date', type: 'date' }) maturityDate: string;
  @Column({ name: 'interest_accrued', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) interestAccrued: number;
  @Column({ name: 'interest_accrued_at', type: 'timestamp', nullable: true }) interestAccruedAt: Date | null;
  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true }) glAccountId: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
