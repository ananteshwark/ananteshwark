import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export interface IcTier {
  fromPct: number; // attainment band start (inclusive)
  toPct: number;   // band end (exclusive); use a large number for the top tier
  rate: number;    // commission rate as a fraction (e.g. 0.05)
}

export interface IcAccelerator {
  productFamily: string;
  multiplier: number;
}

/**
 * Ph-225 — An incentive compensation plan: attainment tiers, product
 * accelerators, a payout cap, and a recoverable draw.
 */
@Entity('ic_plans')
@Index(['tenantId', 'code'], { unique: true })
export class IcPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  tiers: IcTier[];

  @Column({ type: 'jsonb', default: [] })
  accelerators: IcAccelerator[];

  @Column({ name: 'cap_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  capAmount: number | null;

  @Column({ name: 'draw_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  drawAmount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
