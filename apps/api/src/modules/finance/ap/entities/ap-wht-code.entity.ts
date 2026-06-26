import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WhtCertificateType {
  FORM_16A = 'FORM_16A', // India TDS (non-salary)
  FORM_1099 = 'FORM_1099', // US
  GENERIC = 'GENERIC',
}

/**
 * Ph-103 — AP Withholding Tax code.
 * Oracle equivalent: Payables Withholding Tax codes / India TDS sections.
 * Example: section 194J, rate 10%, threshold 30000 (don't withhold below).
 */
@Entity('fin_ap_wht_codes')
@Index(['tenantId', 'code'], { unique: true })
export class ApWhtCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 30 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 30, nullable: true })
  section: string | null; // e.g. India TDS section "194J"

  @Column({ type: 'decimal', precision: 9, scale: 4, default: 0 })
  rate: number; // percent

  @Column({ name: 'threshold_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  thresholdAmount: number; // do not withhold when gross < threshold

  @Column({ name: 'certificate_type', type: 'enum', enum: WhtCertificateType, default: WhtCertificateType.FORM_16A })
  certificateType: WhtCertificateType;

  @Column({ name: 'applicable_vendor_type', length: 30, nullable: true })
  applicableVendorType: string | null;

  @Column({ name: 'liability_account_code', length: 20, nullable: true })
  liabilityAccountCode: string | null; // overrides default WHT_PAYABLE

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
