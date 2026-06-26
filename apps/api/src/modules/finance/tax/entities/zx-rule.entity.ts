import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ZxRuleType {
  APPLICABILITY = 'APPLICABILITY', // does this tax apply at all?
  STATUS = 'STATUS', // which status (standard/exempt/zero)?
  RATE = 'RATE', // which specific rate?
  PLACE_OF_SUPPLY = 'PLACE_OF_SUPPLY', // determine taxing jurisdiction
}

/**
 * Ph-122 — Tax determination rule. Evaluated in ascending priority order per
 * (regime, rule type). The condition is a JSON expression matched against the
 * transaction context (party type, geography, item class, amount, intraState…).
 * The first matching rule supplies the result (status id / rate id / boolean).
 */
@Entity('zx_rules')
@Index(['tenantId', 'regimeId', 'ruleType', 'priority'])
export class ZxRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'regime_id', type: 'uuid' })
  regimeId: string;

  @Column({ name: 'tax_id', type: 'uuid', nullable: true })
  taxId: string | null;

  @Column({ length: 120 })
  name: string;

  @Column({ name: 'rule_type', type: 'enum', enum: ZxRuleType })
  ruleType: ZxRuleType;

  @Column({ type: 'int', default: 50 })
  priority: number;

  @Column({ name: 'condition_expression', type: 'jsonb', nullable: true })
  conditionExpression: any | null; // same leaf/and/or/not grammar as SLA

  // Result legs (depend on ruleType)
  @Column({ name: 'result_applicable', type: 'boolean', nullable: true })
  resultApplicable: boolean | null;

  @Column({ name: 'result_status_id', type: 'uuid', nullable: true })
  resultStatusId: string | null;

  @Column({ name: 'result_rate_id', type: 'uuid', nullable: true })
  resultRateId: string | null;

  @Column({ name: 'result_place_of_supply', length: 60, nullable: true })
  resultPlaceOfSupply: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
