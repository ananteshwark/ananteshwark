import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * Ph-152 — Freight rate table entry.
 * Rate for a carrier between two zones within a weight band:
 *   cost = flatRate + ratePerKg × weight, then × (1 + fuelSurchargePct/100),
 *   floored at minCharge.
 */
@Entity('log_freight_rates')
@Index(['tenantId', 'carrierId', 'originZone', 'destZone'])
export class FreightRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'carrier_id', type: 'uuid' })
  carrierId: string;

  @Column({ name: 'origin_zone', length: 40 })
  originZone: string;

  @Column({ name: 'dest_zone', length: 40 })
  destZone: string;

  @Column({ name: 'min_weight', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  minWeight: number;

  @Column({ name: 'max_weight', type: 'numeric', precision: 18, scale: 3, default: 999999, transformer: decimalTransformer })
  maxWeight: number;

  @Column({ name: 'flat_rate', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  flatRate: number;

  @Column({ name: 'rate_per_kg', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  ratePerKg: number;

  @Column({ name: 'min_charge', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  minCharge: number;

  @Column({ name: 'fuel_surcharge_pct', type: 'numeric', precision: 9, scale: 4, default: 0, transformer: decimalTransformer })
  fuelSurchargePct: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
