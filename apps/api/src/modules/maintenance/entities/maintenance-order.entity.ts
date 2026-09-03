import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum MaintenanceOrderType {
  PREVENTIVE = 'PREVENTIVE',
  BREAKDOWN  = 'BREAKDOWN',
  CORRECTIVE = 'CORRECTIVE',
}

export enum MaintenanceOrderPriority {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum MaintenanceOrderStatus {
  OPEN        = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
}

@Entity('pm_maintenance_orders')
@Index(['tenantId', 'orderNumber'], { unique: true })
export class MaintenanceOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'order_number', length: 50 }) orderNumber: string;
  @Column({ name: 'equipment_id', type: 'uuid' }) equipmentId: string;
  @Column({ name: 'plan_id', type: 'uuid', nullable: true }) planId: string | null;
  @Column({ type: 'enum', enum: MaintenanceOrderType }) type: MaintenanceOrderType;
  @Column({ type: 'enum', enum: MaintenanceOrderPriority, default: MaintenanceOrderPriority.MEDIUM }) priority: MaintenanceOrderPriority;
  @Column({ type: 'enum', enum: MaintenanceOrderStatus, default: MaintenanceOrderStatus.OPEN }) status: MaintenanceOrderStatus;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true }) assignedToId: string | null;
  @Column({ name: 'planned_start_date', type: 'date', nullable: true }) plannedStartDate: string | null;
  @Column({ name: 'planned_end_date', type: 'date', nullable: true }) plannedEndDate: string | null;
  @Column({ name: 'actual_start_date', type: 'date', nullable: true }) actualStartDate: string | null;
  @Column({ name: 'actual_end_date', type: 'date', nullable: true }) actualEndDate: string | null;
  @Column({ name: 'labor_hours', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: decimalTransformer }) laborHours: number | null;
  @Column({ name: 'spare_parts', type: 'jsonb', nullable: true }) spareParts: Array<{ code: string; name: string; quantity: number; cost?: number }> | null;
  @Column({ name: 'total_cost', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) totalCost: number | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
