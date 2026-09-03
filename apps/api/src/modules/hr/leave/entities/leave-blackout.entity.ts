import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Blackout window: leave applications overlapping the window are rejected.
 * Scoped to one leave type or (leaveTypeId null) to all types.
 */
@Entity('hr_leave_blackouts')
@Index(['tenantId', 'fromDate'])
export class LeaveBlackout {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'from_date', type: 'date' }) fromDate: string;
  @Column({ name: 'to_date', type: 'date' }) toDate: string;
  @Column({ name: 'leave_type_id', type: 'uuid', nullable: true }) leaveTypeId: string | null;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
