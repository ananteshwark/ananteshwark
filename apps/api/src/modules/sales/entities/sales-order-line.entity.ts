import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum LineStatus {
  PENDING   = 'PENDING',
  PARTIAL   = 'PARTIAL',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

@Entity('so_order_lines')
export class SalesOrderLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @Column({ name: 'line_number', type: 'int' }) lineNumber: number;
  @Column({ name: 'item_code', length: 100, nullable: true }) itemCode: string | null;
  @Column({ name: 'item_name' }) itemName: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) quantity: number;
  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) unitPrice: number;
  @Column({ name: 'discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) discountPct: number;
  @Column({ name: 'tax_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) taxPct: number;
  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) lineTotal: number;
  @Column({ name: 'qty_shipped', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qtyShipped: number;
  @Column({ type: 'enum', enum: LineStatus, default: LineStatus.PENDING }) status: LineStatus;
  @Column({ name: 'inventory_item_id', type: 'uuid', nullable: true }) inventoryItemId: string | null;
  @Column({ name: 'uom', length: 20, nullable: true }) uom: string | null;
  // Ph-145/146: fulfillment source (additive; null = stock fulfillment)
  @Column({ name: 'fulfillment_type', length: 20, nullable: true }) fulfillmentType: string | null;
  @CreateDateColumn() createdAt: Date;
}
