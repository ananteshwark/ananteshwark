import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum SubcontractStatus {
  DRAFT = 'DRAFT',
  COMPONENTS_SENT = 'COMPONENTS_SENT',
  FINISHED_RECEIVED = 'FINISHED_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('inv_subcontract_orders')
@Index(['tenantId', 'scNumber'], { unique: true })
export class SubcontractOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'sc_number', length: 50 }) scNumber: string;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true }) vendorId: string | null;
  @Column({ name: 'vendor_name', nullable: true }) vendorName: string | null;
  @Column({ name: 'po_id', type: 'uuid', nullable: true }) poId: string | null;

  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'item_code' }) itemCode: string;
  @Column({ name: 'finished_qty', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) finishedQty: number;
  @Column({ name: 'unit_conversion_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) unitConversionCost: number;
  @Column({ name: 'receiving_warehouse_id', type: 'uuid', nullable: true }) receivingWarehouseId: string | null;
  @Column({ name: 'sending_warehouse_id', type: 'uuid', nullable: true }) sendingWarehouseId: string | null;

  @Column({ type: 'jsonb', default: [] }) components: Array<{
    itemId: string;
    itemCode: string;
    qty: number;
    unitCost: number;
  }>;

  @Column({ type: 'enum', enum: SubcontractStatus, default: SubcontractStatus.DRAFT }) status: SubcontractStatus;

  @Column({ name: 'planned_date', type: 'date', nullable: true }) plannedDate: string | null;
  @Column({ name: 'actual_send_date', type: 'date', nullable: true }) actualSendDate: string | null;
  @Column({ name: 'actual_receive_date', type: 'date', nullable: true }) actualReceiveDate: string | null;

  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
