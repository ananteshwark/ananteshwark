import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum LeaseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentTiming {
  ARREARS = 'ARREARS', // ordinary annuity — payment at period end
  ADVANCE = 'ADVANCE', // annuity due — payment at period start
}

/**
 * An IFRS 16 lessee lease. On commencement a right-of-use (ROU) asset and a
 * lease liability are recognised at the present value of the lease payments,
 * discounted at the incremental borrowing rate. The liability unwinds with
 * interest while the ROU asset amortises straight-line over the lease term.
 */
@Entity('fin_leases')
@Index(['tenantId', 'leaseNumber'], { unique: true })
export class Lease {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'lease_number', length: 50 })
  leaseNumber: string;

  @Column({ name: 'lessor_name', length: 200, nullable: true })
  lessorName: string | null;

  @Column({ name: 'asset_description', length: 300, nullable: true })
  assetDescription: string | null;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'term_months', type: 'int' })
  termMonths: number;

  /** Periodic (monthly) lease payment. */
  @Column({
    name: 'payment_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  paymentAmount: number;

  @Column({ name: 'payment_timing', type: 'enum', enum: PaymentTiming, default: PaymentTiming.ARREARS })
  paymentTiming: PaymentTiming;

  /** Annual incremental borrowing rate, percent (e.g. 6.0 = 6%). */
  @Column({
    name: 'annual_discount_rate',
    type: 'numeric',
    precision: 9,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  annualDiscountRate: number;

  /** Present value of payments at commencement = initial lease liability. */
  @Column({
    name: 'initial_liability',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  initialLiability: number;

  /** Initial ROU asset (liability + initial direct costs, simplified to liability). */
  @Column({
    name: 'rou_asset',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  rouAsset: number;

  /** Optional initial direct costs added to the ROU asset. */
  @Column({
    name: 'initial_direct_costs',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  initialDirectCosts: number;

  @Column({
    name: 'liability_balance',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  liabilityBalance: number;

  @Column({
    name: 'accumulated_amortization',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  accumulatedAmortization: number;

  @Column({ type: 'enum', enum: LeaseStatus, default: LeaseStatus.ACTIVE })
  status: LeaseStatus;

  // GL account overrides (fall back to default codes when null).
  @Column({ name: 'rou_asset_account_id', type: 'uuid', nullable: true })
  rouAssetAccountId: string | null;

  @Column({ name: 'accum_amort_account_id', type: 'uuid', nullable: true })
  accumAmortAccountId: string | null;

  @Column({ name: 'lease_liability_account_id', type: 'uuid', nullable: true })
  leaseLiabilityAccountId: string | null;

  @Column({ name: 'interest_expense_account_id', type: 'uuid', nullable: true })
  interestExpenseAccountId: string | null;

  @Column({ name: 'amort_expense_account_id', type: 'uuid', nullable: true })
  amortExpenseAccountId: string | null;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'initial_journal_entry_id', type: 'uuid', nullable: true })
  initialJournalEntryId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
