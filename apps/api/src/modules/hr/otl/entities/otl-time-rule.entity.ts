import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum OtlRuleType {
  DAILY_OT = 'DAILY_OT',       // hours beyond a daily threshold
  WEEKLY_OT = 'WEEKLY_OT',     // regular hours beyond a weekly threshold
  SEVENTH_DAY = 'SEVENTH_DAY', // premium on the 7th consecutive worked day
  SHIFT_DIFFERENTIAL = 'SHIFT_DIFFERENTIAL', // premium % for night/weekend
}

export enum ShiftCondition {
  NIGHT = 'NIGHT',
  WEEKEND = 'WEEKEND',
  HOLIDAY = 'HOLIDAY',
}

/**
 * Ph-194/195 — Oracle Time & Labor rule. Drives overtime triggers and shift
 * differentials. The pay element code routes computed hours into payroll.
 */
@Entity('otl_time_rules')
@Index(['tenantId', 'ruleType'])
export class OtlTimeRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'rule_type', type: 'enum', enum: OtlRuleType })
  ruleType: OtlRuleType;

  @Column({ name: 'threshold_hours', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  thresholdHours: number;

  @Column({ name: 'pay_multiplier', type: 'numeric', precision: 5, scale: 2, default: 1, transformer: decimalTransformer })
  payMultiplier: number;

  @Column({ name: 'premium_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  premiumPct: number;

  @Column({ name: 'shift_condition', type: 'enum', enum: ShiftCondition, nullable: true })
  shiftCondition: ShiftCondition | null;

  @Column({ name: 'pay_element_code', length: 30, default: 'OT' })
  payElementCode: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
