import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AccrualSource {
  SYSTEM = 'SYSTEM',
  MANUAL = 'MANUAL',
}

@Entity('hr_leave_accrual_logs')
export class LeaveAccrualLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'leave_type_id', type: 'uuid' })
  leaveTypeId: string;

  @Column({ name: 'accrual_date', type: 'date' })
  accrualDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  units: number;

  @Column({ name: 'leave_year', type: 'int' })
  leaveYear: number;

  @Column({ type: 'enum', enum: AccrualSource, default: AccrualSource.SYSTEM })
  source: AccrualSource;

  @CreateDateColumn()
  createdAt: Date;
}
