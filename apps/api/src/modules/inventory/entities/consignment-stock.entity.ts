import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ConsignmentStatus {
  ACTIVE = 'ACTIVE',
  FULLY_CONSUMED = 'FULLY_CONSUMED',
  RETURNED = 'RETURNED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
}

@Entity('inv_consignment_stocks')
@Index(['tenantId', 'vendorId', 'itemId', 'warehouseId'])
export class ConsignmentStock {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;

  @Column({ name: 'vendor_id', type: 'uuid' }) vendorId: string;
  @Column({ name: 'vendor_name', nullable: true }) vendorName: string | null;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;

  @Column({ name: 'qty_received', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) qtyReceived: number;
  @Column({ name: 'qty_consumed', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qtyConsumed: number;
  @Column({ name: 'qty_returned', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) qtyReturned: number;
  @Column({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) unitCost: number;

  @Column({ name: 'receipt_date', type: 'date' }) receiptDate: string;
  @Column({ type: 'enum', enum: ConsignmentStatus, default: ConsignmentStatus.ACTIVE }) status: ConsignmentStatus;

  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
