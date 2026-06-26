import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { WhtCertificateType } from './ap-wht-code.entity';

/**
 * Ph-105 — Withholding tax certificate.
 * Summarizes WHT deducted for a vendor over a period (India Form 16A / US 1099).
 */
@Entity('fin_wht_certificates')
@Index(['tenantId', 'vendorId', 'fiscalYear'])
export class WhtCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'certificate_number', length: 50 })
  certificateNumber: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName: string | null;

  @Column({ name: 'wht_code', length: 30, nullable: true })
  whtCode: string | null;

  @Column({ length: 30, nullable: true })
  section: string | null;

  @Column({ name: 'certificate_type', type: 'enum', enum: WhtCertificateType, default: WhtCertificateType.FORM_16A })
  certificateType: WhtCertificateType;

  @Column({ name: 'fiscal_year', length: 10 })
  fiscalYear: string; // e.g. "2026-27"

  @Column({ name: 'period_from', type: 'date' })
  periodFrom: string;

  @Column({ name: 'period_to', type: 'date' })
  periodTo: string;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  grossAmount: number;

  @Column({ name: 'wht_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  whtAmount: number;

  @Column({ name: 'bill_count', type: 'int', default: 0 })
  billCount: number;

  @Column({ name: 'line_items', type: 'jsonb', nullable: true })
  lineItems: any | null; // per-bill breakdown

  @CreateDateColumn()
  createdAt: Date;
}
