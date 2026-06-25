import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Defines a trading relationship between two legal entities of the same tenant.
 * The selling entity bills the buying entity; an optional markup is applied on
 * top of the base amount of every transaction booked against this pair.
 */
@Entity('fin_ic_relationships')
@Index(['tenantId', 'sellingEntityId', 'buyingEntityId'], { unique: true })
export class IcRelationship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'selling_entity_id', type: 'uuid' })
  sellingEntityId: string;

  @Column({ name: 'buying_entity_id', type: 'uuid' })
  buyingEntityId: string;

  @Column({
    name: 'markup_percent',
    type: 'numeric',
    precision: 9,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  markupPercent: number;

  @Column({ name: 'elimination_account_id', type: 'uuid', nullable: true })
  eliminationAccountId: string | null;

  // Phase 86 — automatic IC billing wiring.
  /** Customer record in the SELLING entity's books representing the buying entity. */
  @Column({ name: 'ic_customer_id', type: 'uuid', nullable: true })
  icCustomerId: string | null;

  /** Vendor record in the BUYING entity's books representing the selling entity. */
  @Column({ name: 'ic_vendor_id', type: 'uuid', nullable: true })
  icVendorId: string | null;

  /** Revenue GL account used by the selling entity for IC sales (elimination). */
  @Column({ name: 'revenue_account_id', type: 'uuid', nullable: true })
  revenueAccountId: string | null;

  /** Expense/COGS GL account used by the buying entity for IC purchases (elimination). */
  @Column({ name: 'expense_account_id', type: 'uuid', nullable: true })
  expenseAccountId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
