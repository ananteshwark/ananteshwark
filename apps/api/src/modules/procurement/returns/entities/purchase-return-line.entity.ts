import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_purchase_return_lines')
@Index(['tenantId', 'returnId'])
export class PurchaseReturnLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'return_id', type: 'uuid' })
  returnId: string;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'item_code', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ name: 'item_description', type: 'text', nullable: true })
  itemDescription: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantity: number;

  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  unitCost: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount: number;

  @CreateDateColumn()
  createdAt: Date;
}
