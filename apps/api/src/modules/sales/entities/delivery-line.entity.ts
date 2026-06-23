import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('so_delivery_lines')
export class DeliveryLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'delivery_order_id', type: 'uuid' }) deliveryOrderId: string;
  @Column({ name: 'sales_order_line_id', type: 'uuid', nullable: true }) salesOrderLineId: string | null;
  @Column({ name: 'item_id', type: 'uuid', nullable: true }) itemId: string | null;
  @Column({ name: 'item_description' }) itemDescription: string;
  @Column({ name: 'ordered_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) orderedQty: number;
  @Column({ name: 'delivered_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) deliveredQty: number;
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true }) warehouseId: string | null;
  @Column({ name: 'lot_id', type: 'uuid', nullable: true }) lotId: string | null;
  @CreateDateColumn() createdAt: Date;
}
