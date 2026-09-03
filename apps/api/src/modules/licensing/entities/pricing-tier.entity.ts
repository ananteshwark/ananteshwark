import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { LicensePlan } from './license-plan.entity';

@Entity('lic_pricing_tiers')
@Index(['planId'])
export class PricingTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'plan_id' })
  planId: string;

  @Column({ name: 'tier_name', length: 100 })
  tierName: string;

  @Column({ name: 'min_units', type: 'int' })
  minUnits: number;

  @Column({ name: 'max_units', type: 'int', nullable: true })
  maxUnits: number | null;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    name: 'flat_fee',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
    default: 0,
  })
  flatFee: number;

  @ManyToOne(() => LicensePlan, (plan) => plan.tiers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: LicensePlan;
}
