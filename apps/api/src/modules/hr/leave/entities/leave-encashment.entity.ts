import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum EncashmentStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Leave encashment request: converts unused balance of an encashable leave
 * type into a payout. Approval deducts the units from the balance (as an
 * adjustment) and emits `leave.encashed` for payroll to pick up.
 */
@Entity('hr_leave_encashments')
@Index(['tenantId', 'employeeId'])
export class LeaveEncashment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'leave_type_id', type: 'uuid' }) leaveTypeId: string;
  @Column({ name: 'leave_year', type: 'int' }) leaveYear: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) units: number;
  @Column({ type: 'enum', enum: EncashmentStatus, default: EncashmentStatus.REQUESTED })
  status: EncashmentStatus;
  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true }) reviewedById: string | null;
  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @CreateDateColumn() createdAt: Date;
}
