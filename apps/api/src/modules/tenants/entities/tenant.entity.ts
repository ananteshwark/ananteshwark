import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  TRIAL = 'trial',
}

export enum TenantStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
}

export interface TenantSettings {
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
  };
  locale?: string;
  timezone?: string;
  fiscalYearStart?: number;
  baseCurrency?: string;
  enabledModules?: string[];
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, unique: true })
  slug: string;

  @Column({ type: 'enum', enum: TenantPlan, default: TenantPlan.TRIAL })
  plan: TenantPlan;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.TRIAL })
  status: TenantStatus;

  @Column({ type: 'jsonb', default: {} })
  settings: TenantSettings;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
