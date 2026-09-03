import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('so_return_order_lines')
@Index(['tenantId', 'returnOrderId'])
export class ReturnOrderLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'return_order_id', type: 'uuid' }) returnOrderId: string;

  @Column({ name: 'item_id', type: 'uuid', nullable: true }) itemId: string | null;
  @Column({ name: 'item_description', length: 300 }) itemDescription: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  unitPrice: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true }) warehouseId: string | null;
}
