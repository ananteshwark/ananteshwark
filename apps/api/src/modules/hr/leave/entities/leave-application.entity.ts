import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum LeaveApplicationStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum HalfDayPeriod {
  MORNING = 'MORNING',
  AFTERNOON = 'AFTERNOON',
}

@Entity('hr_leave_applications')
export class LeaveApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'leave_type_id', type: 'uuid' })
  leaveTypeId: string;

  @Column({ name: 'from_date', type: 'date' })
  fromDate: string;

  @Column({ name: 'to_date', type: 'date' })
  toDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  days: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'enum', enum: LeaveApplicationStatus, default: LeaveApplicationStatus.SUBMITTED })
  status: LeaveApplicationStatus;

  @Column({ name: 'applied_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  appliedAt: Date;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'review_remarks', type: 'text', nullable: true })
  reviewRemarks: string | null;

  // Populated for hourly applications; `days` carries the converted fraction.
  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true })
  hours: number | null;

  @Column({ name: 'half_day', default: false })
  halfDay: boolean;

  @Column({ name: 'half_day_period', type: 'enum', enum: HalfDayPeriod, nullable: true })
  halfDayPeriod: HalfDayPeriod | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
