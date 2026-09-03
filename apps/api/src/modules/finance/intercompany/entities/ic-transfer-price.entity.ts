import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum TransferPricingMethod {
  COST_PLUS = 'COST_PLUS', // unit price = baseCost * (1 + costPlusPercent/100)
  FIXED = 'FIXED', // unit price = fixedPrice
  MARKET = 'MARKET', // unit price = marketPrice (arm's-length reference)
}

/**
 * Transfer-pricing rule for an intercompany entity pair. A rule may target a
 * specific item (itemCode) or act as the pair default (itemCode = null). The
 * most specific active rule covering the requested date wins.
 */
@Entity('fin_ic_transfer_prices')
@Index(['tenantId', 'sellingEntityId', 'buyingEntityId', 'itemCode'])
export class IcTransferPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'selling_entity_id', type: 'uuid' })
  sellingEntityId: string;

  @Column({ name: 'buying_entity_id', type: 'uuid' })
  buyingEntityId: string;

  /** null = default rule for the whole pair */
  @Column({ name: 'item_code', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ type: 'enum', enum: TransferPricingMethod })
  method: TransferPricingMethod;

  @Column({
    name: 'cost_plus_percent',
    type: 'numeric',
    precision: 9,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  costPlusPercent: number;

  @Column({
    name: 'fixed_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  fixedPrice: number | null;

  @Column({
    name: 'market_price',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  marketPrice: number | null;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
