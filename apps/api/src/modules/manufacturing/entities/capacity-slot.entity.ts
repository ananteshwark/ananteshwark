import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum SlotStatus {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('mfg_capacity_slots')
@Index(['tenantId', 'workCenterId', 'scheduledStart'])
export class CapacitySlot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'work_center_id', type: 'uuid' }) workCenterId: string;
  @Column({ name: 'production_order_id', type: 'uuid' }) productionOrderId: string;
  @Column({ name: 'operation_id', type: 'uuid', nullable: true }) operationId: string | null;
  @Column({ name: 'operation_name', length: 200, nullable: true }) operationName: string | null;
  @Column({ name: 'scheduled_start', type: 'timestamp' }) scheduledStart: Date;
  @Column({ name: 'scheduled_end', type: 'timestamp' }) scheduledEnd: Date;
  @Column({ name: 'load_minutes', type: 'int' }) loadMinutes: number;
  @Column({ name: 'setup_minutes', type: 'int', default: 0 }) setupMinutes: number;
  @Column({ type: 'enum', enum: SlotStatus, default: SlotStatus.SCHEDULED }) status: SlotStatus;
  @Column({ name: 'priority', type: 'int', default: 50 }) priority: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
