import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { PricingTier } from './pricing-tier.entity';

export enum LicenseType {
  EMPLOYEE_BASED = 'EMPLOYEE_BASED',
  EMPLOYEE_PER_MODULE = 'EMPLOYEE_PER_MODULE',
  ENTERPRISE_CONSUMPTION = 'ENTERPRISE_CONSUMPTION',
}

@Entity('lic_plans')
export class LicensePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string | null;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ name: 'license_type', type: 'enum', enum: LicenseType })
  licenseType: LicenseType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => PricingTier, (tier) => tier.plan, { cascade: true })
  tiers: PricingTier[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
