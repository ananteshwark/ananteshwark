import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_info_records')
@Index(['tenantId', 'vendorId', 'itemId'])
export class PurchasingInfoRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  price: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'lead_time_days', type: 'int', default: 0 })
  leadTimeDays: number;

  @Column({
    name: 'min_order_qty',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  minOrderQty: number | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({
    name: 'last_purchase_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  lastPurchasePrice: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
