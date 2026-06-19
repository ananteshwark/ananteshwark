import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('inv_stock_balances')
@Index(['tenantId', 'itemId', 'warehouseId'], { unique: true })
export class StockBalance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'qty_on_hand', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qtyOnHand: number;
  @Column({ name: 'qty_reserved', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qtyReserved: number;
  @Column({ name: 'total_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) totalCost: number;
  @Column({ name: 'avg_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) avgCost: number;
  @UpdateDateColumn() updatedAt: Date;
}
