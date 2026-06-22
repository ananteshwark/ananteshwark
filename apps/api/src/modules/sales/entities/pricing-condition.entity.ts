import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ConditionType {
  BASE_PRICE        = 'BASE_PRICE',
  DISCOUNT_PERCENT  = 'DISCOUNT_PERCENT',
  DISCOUNT_AMOUNT   = 'DISCOUNT_AMOUNT',
  SURCHARGE_PERCENT = 'SURCHARGE_PERCENT',
  SURCHARGE_AMOUNT  = 'SURCHARGE_AMOUNT',
}

export enum ConditionKeyType {
  ITEM          = 'ITEM',
  CUSTOMER      = 'CUSTOMER',
  CUSTOMER_ITEM = 'CUSTOMER_ITEM',
  ALL           = 'ALL',
}

@Entity('so_pricing_conditions')
@Index(['tenantId', 'keyType'])
export class PricingCondition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;

  @Column({ name: 'condition_type', type: 'enum', enum: ConditionType }) conditionType: ConditionType;
  @Column({ name: 'key_type', type: 'enum', enum: ConditionKeyType }) keyType: ConditionKeyType;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'item_id', type: 'uuid', nullable: true }) itemId: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) rate: number;
  @Column({ length: 10, default: 'USD' }) currency: string;

  @Column({ name: 'min_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) minQty: number | null;
  @Column({ name: 'max_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) maxQty: number | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true }) validFrom: string | null;
  @Column({ name: 'valid_to', type: 'date', nullable: true }) validTo: string | null;

  @Column({ type: 'int', default: 10 }) priority: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
