import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RoundingRule {
  NEAREST = 'NEAREST',
  UP = 'UP',
  DOWN = 'DOWN',
}

/**
 * Ph-168 — Legislative Data Group.
 * Oracle Global Payroll: a country payroll framework holding the currency,
 * rounding rules, social-insurance rates and tax-regime flags that drive
 * country-specific gross-to-net calculations.
 */
@Entity('hr_ldgs')
@Index(['tenantId', 'code'], { unique: true })
@Index(['tenantId', 'countryCode'])
export class LegislativeDataGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 40 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'country_code', length: 2 })
  countryCode: string; // ISO-2: IN, GB, US

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'rounding_rule', type: 'enum', enum: RoundingRule, default: RoundingRule.NEAREST })
  roundingRule: RoundingRule;

  @Column({ name: 'rounding_precision', type: 'int', default: 0 })
  roundingPrecision: number; // decimal places

  /**
   * Country config: social-insurance rates, tax regime flags, statutory caps.
   * e.g. { pfPct: 12, esiPct: 0.75, regimes: ['OLD','NEW'] } for India.
   */
  @Column({ type: 'jsonb', default: {} })
  config: Record<string, any>;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
