import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Ph-121 — Oracle ZX tax hierarchy: Regime → Tax → Status → Rate.
 * Each level carries effective dates. A regime models a jurisdiction's tax
 * framework (e.g. India GST, UK VAT); taxes are the individual levies
 * (CGST/SGST/IGST or VAT); statuses are STANDARD/EXEMPT/ZERO; rates are the
 * effective-dated percentages.
 */

@Entity('zx_regimes')
@Index(['tenantId', 'code'], { unique: true })
export class ZxRegime {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 2, nullable: true })
  country: string | null; // ISO-2

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('zx_taxes')
@Index(['tenantId', 'regimeId', 'code'], { unique: true })
export class ZxTax {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'regime_id', type: 'uuid' })
  regimeId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('zx_statuses')
@Index(['tenantId', 'taxId', 'code'], { unique: true })
export class ZxStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tax_id', type: 'uuid' })
  taxId: string;

  @Column({ length: 40 })
  code: string; // STANDARD / EXEMPT / ZERO / REDUCED

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('zx_rates')
@Index(['tenantId', 'statusId', 'effectiveFrom'])
export class ZxRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ type: 'numeric', precision: 9, scale: 4, default: 0 })
  rate: number; // percent

  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true })
  glAccountId: string | null;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
