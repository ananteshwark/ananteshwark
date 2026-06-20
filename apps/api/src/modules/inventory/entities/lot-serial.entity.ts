import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TrackingType {
  LOT    = 'LOT',
  SERIAL = 'SERIAL',
}

export enum LotStatus {
  ACTIVE    = 'ACTIVE',
  QUARANTINE = 'QUARANTINE',
  EXPIRED   = 'EXPIRED',
  CONSUMED  = 'CONSUMED',
}

@Entity('inv_lot_serials')
@Index(['tenantId', 'itemId', 'lotNumber'], { unique: true })
export class LotSerial {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'lot_number', length: 100 }) lotNumber: string;
  @Column({ name: 'tracking_type', type: 'enum', enum: TrackingType }) trackingType: TrackingType;
  @Column({ name: 'manufacture_date', type: 'date', nullable: true }) manufactureDate: string | null;
  @Column({ name: 'expiry_date', type: 'date', nullable: true }) expiryDate: string | null;
  @Column({ name: 'received_qty', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) receivedQty: number;
  @Column({ name: 'available_qty', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) availableQty: number;
  @Column({ type: 'enum', enum: LotStatus, default: LotStatus.ACTIVE }) status: LotStatus;
  @Column({ name: 'supplier_lot_number', nullable: true }) supplierLotNumber: string | null;
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true }) warehouseId: string | null;
  @Column({ name: 'bin_id', type: 'uuid', nullable: true }) binId: string | null;
  @CreateDateColumn() createdAt: Date;
}
