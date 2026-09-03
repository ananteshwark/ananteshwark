import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum VendorStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('fin_vendors')
@Index(['code', 'tenantId'], { unique: true })
export class Vendor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ type: 'jsonb', nullable: true })
  address: Record<string, any>;

  @Column({ name: 'tax_id', length: 100, nullable: true })
  taxId: string;

  @Column({ name: 'payment_terms', type: 'int', default: 30 })
  paymentTerms: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: VendorStatus, default: VendorStatus.ACTIVE })
  status: VendorStatus;

  @Column({ name: 'ap_account_id', type: 'uuid', nullable: true })
  apAccountId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'portal_enabled', type: 'boolean', default: false })
  portalEnabled: boolean;

  @Column({ name: 'portal_password_hash', length: 255, nullable: true })
  portalPasswordHash: string | null;

  @Column({ name: 'portal_last_login', type: 'timestamp', nullable: true })
  portalLastLogin: Date | null;

  @Column({ name: 'contact_person', length: 200, nullable: true })
  contactPerson: string | null;

  @Column({ name: 'portal_email', length: 255, nullable: true })
  portalEmail: string | null;

  // ─── Phase 30: Vendor Master Enrichment (additive) ───
  @Column({ name: 'payment_terms_code', length: 30, nullable: true })
  paymentTermsCode: string | null;

  @Column({ name: 'bank_name', length: 200, nullable: true })
  bankName: string | null;

  @Column({ name: 'bank_account_number', length: 100, nullable: true })
  bankAccountNumber: string | null;

  @Column({ name: 'bank_ifsc', length: 50, nullable: true })
  bankIfsc: string | null;

  @Column({ name: 'iban', length: 50, nullable: true })
  iban: string | null;

  @Column({ name: 'swift', length: 50, nullable: true })
  swift: string | null;

  @Column({ name: 'default_tax_code_id', type: 'uuid', nullable: true })
  defaultTaxCodeId: string | null;

  @Column({ name: 'pan_number', length: 50, nullable: true })
  panNumber: string | null;

  @Column({ name: 'gst_number', length: 50, nullable: true })
  gstNumber: string | null;

  @Column({ name: 'vendor_type', length: 30, nullable: true })
  vendorType: string | null;

  @Column({
    name: 'credit_limit',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  creditLimit: number | null;

  @Column({ name: 'reconciliation_account_id', type: 'uuid', nullable: true })
  reconciliationAccountId: string | null;

  @Column({ name: 'payment_block', type: 'boolean', default: false })
  paymentBlock: boolean;

  @Column({ name: 'order_block', type: 'boolean', default: false })
  orderBlock: boolean;

  @Column({ name: 'block_reason', type: 'text', nullable: true })
  blockReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
