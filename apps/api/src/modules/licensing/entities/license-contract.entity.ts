import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { LicenseType } from './license-plan.entity';

export enum ContractStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

@Entity('lic_contracts')
@Index(['tenantId'])
export class LicenseContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_number', length: 50 })
  contractNumber: string;

  @Column({ name: 'plan_id', nullable: true })
  planId: string | null;

  @Column({ name: 'license_type', type: 'enum', enum: LicenseType })
  licenseType: LicenseType;

  @Column({ type: 'enum', enum: ContractStatus, default: ContractStatus.TRIAL })
  status: ContractStatus;

  @Column({ name: 'billing_cycle', type: 'enum', enum: BillingCycle })
  billingCycle: BillingCycle;

  @Column({ name: 'contract_start_date', type: 'date' })
  contractStartDate: string;

  @Column({ name: 'contract_end_date', type: 'date' })
  contractEndDate: string;

  @Column({ name: 'min_commitment_employees', type: 'int', default: 0 })
  minCommitmentEmployees: number;

  @Column({
    name: 'committed_amount',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
    nullable: true,
  })
  committedAmount: number | null;

  @Column({
    name: 'consumption_pool_units',
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: decimalTransformer,
    nullable: true,
  })
  consumptionPoolUnits: number | null;

  @Column({
    name: 'remaining_units',
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: decimalTransformer,
    nullable: true,
  })
  remainingUnits: number | null;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'payment_terms', length: 50, default: 'NET30' })
  paymentTerms: string;

  @Column({ name: 'grace_period_days', type: 'int', default: 5 })
  gracePeriodDays: number;

  @Column({
    name: 'grace_threshold_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    transformer: decimalTransformer,
    default: 5,
  })
  graceThresholdPct: number;

  @Column({ name: 'billing_contact_email', nullable: true })
  billingContactEmail: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
