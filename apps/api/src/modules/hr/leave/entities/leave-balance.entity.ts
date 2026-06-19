import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('hr_leave_balances')
@Index(['tenantId', 'employeeId', 'leaveTypeId', 'leaveYear'], { unique: true })
export class LeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'leave_type_id', type: 'uuid' })
  leaveTypeId: string;

  @Column({ name: 'leave_year', type: 'int' })
  leaveYear: number;

  @Column({ name: 'opening_balance', type: 'decimal', precision: 10, scale: 2, default: 0 })
  openingBalance: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  accrued: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  taken: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  adjusted: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
