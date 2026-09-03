import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('inv_fifo_layers')
@Index(['tenantId', 'itemId', 'warehouseId', 'layerDate'])
export class FifoLayer {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'receipt_ledger_id', type: 'uuid', nullable: true }) receiptLedgerId: string | null;
  @Column({ name: 'layer_date', type: 'date' }) layerDate: string;
  @Column({ name: 'qty_original', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) qtyOriginal: number;
  @Column({ name: 'qty_remaining', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) qtyRemaining: number;
  @Column({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 6, transformer: decimalTransformer }) unitCost: number;
  @CreateDateColumn() createdAt: Date;
}
