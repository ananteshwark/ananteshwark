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

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
