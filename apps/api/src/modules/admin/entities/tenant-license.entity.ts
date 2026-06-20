import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TenantLicenseTier {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
  TRIAL = 'TRIAL',
}

export enum TenantLicenseStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
}

// License the platform (super admin) allocates to a tenant: seat limits,
// enabled modules and validity. One active allocation per tenant.
@Entity('plt_tenant_licenses')
@Index(['tenantId'], { unique: true })
export class TenantLicense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: TenantLicenseTier, default: TenantLicenseTier.TRIAL })
  tier: TenantLicenseTier;

  @Column({ name: 'max_users', type: 'int', default: 10 })
  maxUsers: number;

  @Column({ name: 'max_employees', type: 'int', default: 50 })
  maxEmployees: number;

  @Column({ name: 'enabled_modules', type: 'jsonb', default: () => "'[]'" })
  enabledModules: string[];

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ type: 'enum', enum: TenantLicenseStatus, default: TenantLicenseStatus.ACTIVE })
  status: TenantLicenseStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
