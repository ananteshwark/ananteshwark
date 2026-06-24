import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TaskType {
  PUTAWAY = 'PUTAWAY',
  PICK = 'PICK',
  MOVE = 'MOVE',
  REPLENISH = 'REPLENISH',
}

export enum TaskStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('inv_warehouse_tasks')
@Index(['tenantId', 'status', 'taskType'])
export class WarehouseTask {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'task_number', length: 30 }) taskNumber: string;
  @Column({ name: 'task_type', type: 'enum', enum: TaskType }) taskType: TaskType;
  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.OPEN }) status: TaskStatus;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'lot_serial_id', type: 'uuid', nullable: true }) lotSerialId: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) qty: number;
  @Column({ name: 'source_bin_id', type: 'uuid', nullable: true }) sourceBinId: string | null;
  @Column({ name: 'dest_bin_id', type: 'uuid', nullable: true }) destBinId: string | null;
  @Column({ name: 'reference_type', length: 50, nullable: true }) referenceType: string | null;
  @Column({ name: 'reference_id', type: 'uuid', nullable: true }) referenceId: string | null;
  @Column({ name: 'assigned_user_id', type: 'uuid', nullable: true }) assignedUserId: string | null;
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true }) completedAt: Date | null;
  @Column({ name: 'priority', type: 'int', default: 50 }) priority: number;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
