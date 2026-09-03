import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum BreakdownSeverity {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum BreakdownStatus {
  OPEN     = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  RESOLVED = 'RESOLVED',
}

@Entity('pm_breakdown_notifications')
@Index(['tenantId'])
export class BreakdownNotification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'equipment_id', type: 'uuid' }) equipmentId: string;
  @Column({ name: 'reported_by_id', type: 'uuid' }) reportedById: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'enum', enum: BreakdownSeverity }) severity: BreakdownSeverity;
  @Column({ type: 'enum', enum: BreakdownStatus, default: BreakdownStatus.OPEN }) status: BreakdownStatus;
  @Column({ name: 'maintenance_order_id', type: 'uuid', nullable: true }) maintenanceOrderId: string | null;
  @Column({ name: 'reported_at', type: 'timestamptz', default: () => 'NOW()' }) reportedAt: Date;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
