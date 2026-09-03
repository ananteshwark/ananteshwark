import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('inv_bin_stocks')
@Index(['tenantId', 'binLocationId', 'itemId', 'lotSerialId'], { unique: true })
export class BinStock {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'bin_location_id', type: 'uuid' }) binLocationId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'lot_serial_id', type: 'uuid', nullable: true }) lotSerialId: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qty: number;
  @Column({ name: 'reserved_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) reservedQty: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
