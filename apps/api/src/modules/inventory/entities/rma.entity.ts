import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum RmaStatus {
  DRAFT     = 'DRAFT',
  APPROVED  = 'APPROVED',
  RECEIVED  = 'RECEIVED',
  INSPECTED = 'INSPECTED',
  COMPLETED = 'COMPLETED',
  REJECTED  = 'REJECTED',
}

export enum RmaType {
  CUSTOMER = 'CUSTOMER',
  SUPPLIER = 'SUPPLIER',
}

export enum RmaDisposition {
  RESTOCK   = 'RESTOCK',
  REPAIR    = 'REPAIR',
  SCRAP     = 'SCRAP',
  RETURN_TO_VENDOR = 'RETURN_TO_VENDOR',
}

@Entity('inv_rmas')
@Index(['tenantId', 'rmaNumber'], { unique: true })
export class Rma {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'rma_number', length: 50 }) rmaNumber: string;
  @Column({ type: 'enum', enum: RmaType }) type: RmaType;
  @Column({ type: 'enum', enum: RmaStatus, default: RmaStatus.DRAFT }) status: RmaStatus;
  @Column({ name: 'customer_vendor_id', type: 'uuid', nullable: true }) customerVendorId: string | null;
  @Column({ name: 'customer_vendor_name', nullable: true }) customerVendorName: string | null;
  @Column({ name: 'original_ref', nullable: true }) originalRef: string | null;
  @Column({ name: 'requested_date', type: 'date' }) requestedDate: string;
  @Column({ name: 'received_date', type: 'date', nullable: true }) receivedDate: string | null;
  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true }) warehouseId: string | null;
  @Column({ type: 'jsonb', default: [] }) lines: Array<{ itemId: string; itemCode: string; qty: number; unitCost: number; reason: string; disposition?: RmaDisposition }>;
  @Column({ name: 'total_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalValue: number;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
