import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_tolerance_policies')
@Index(['tenantId', 'scope'])
export class TolerancePolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200, default: 'Default Tolerance Policy' })
  name: string;

  // GLOBAL (one effective per tenant) — optional narrowing fields kept for future use
  @Column({ length: 30, default: 'GLOBAL' })
  scope: string;

  @Column({ name: 'vendor_id', type: 'varchar', nullable: true })
  vendorId: string | null;

  @Column({ name: 'item_category', type: 'varchar', length: 100, nullable: true })
  itemCategory: string | null;

  @Column({
    name: 'price_percent_tolerance',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 5,
    transformer: decimalTransformer,
  })
  pricePercentTolerance: number;

  @Column({
    name: 'qty_percent_tolerance',
    type: 'numeric',
    precision: 8,
    scale: 2,
    default: 5,
    transformer: decimalTransformer,
  })
  qtyPercentTolerance: number;

  @Column({ name: 'auto_post_within_tolerance', type: 'boolean', default: true })
  autoPostWithinTolerance: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
