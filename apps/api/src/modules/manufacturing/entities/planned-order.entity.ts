import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum PlannedOrderType {
  PLANNED_PO = 'PLANNED_PO',
  PLANNED_PRODUCTION = 'PLANNED_PRODUCTION',
}

export enum PlannedOrderStatus {
  PLANNED = 'PLANNED',
  CONVERTED = 'CONVERTED',
  CANCELLED = 'CANCELLED',
}

@Entity('mfg_planned_orders')
export class PlannedOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'item_name' }) itemName: string;
  @Column({ type: 'enum', enum: PlannedOrderType }) type: PlannedOrderType;
  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) quantity: number;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column({ type: 'enum', enum: PlannedOrderStatus, default: PlannedOrderStatus.PLANNED }) status: PlannedOrderStatus;
  @Column({ name: 'exception_message', type: 'text', nullable: true }) exceptionMessage: string | null;
  @Column({ name: 'source_demand', type: 'text', nullable: true }) sourceDemand: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
