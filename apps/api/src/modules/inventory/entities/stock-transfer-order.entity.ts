import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum StoStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  GOODS_ISSUED = 'GOODS_ISSUED',
  GOODS_RECEIVED = 'GOODS_RECEIVED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('inv_stock_transfer_orders')
@Index(['tenantId', 'stoNumber'], { unique: true })
export class StockTransferOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'sto_number', length: 50 }) stoNumber: string;

  @Column({ name: 'from_warehouse_id', type: 'uuid' }) fromWarehouseId: string;
  @Column({ name: 'to_warehouse_id', type: 'uuid' }) toWarehouseId: string;

  @Column({ type: 'enum', enum: StoStatus, default: StoStatus.DRAFT }) status: StoStatus;

  @Column({ name: 'planned_date', type: 'date', nullable: true }) plannedDate: string | null;
  @Column({ name: 'actual_issue_date', type: 'date', nullable: true }) actualIssueDate: string | null;
  @Column({ name: 'actual_receipt_date', type: 'date', nullable: true }) actualReceiptDate: string | null;
  @Column({ name: 'requested_by_id', type: 'uuid', nullable: true }) requestedById: string | null;
  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true }) approvedById: string | null;

  @Column({ type: 'jsonb', default: [] }) lines: Array<{
    itemId: string;
    itemCode: string;
    qty: number;
  }>;

  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
