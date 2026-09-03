import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('hr_time_eval_results')
@Index(['tenantId', 'employeeId', 'date'], { unique: true })
export class TimeEvaluationResult {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id' }) employeeId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ name: 'shift_id', nullable: true }) shiftId: string | null;
  @Column({ name: 'check_in', nullable: true }) checkIn: string | null;
  @Column({ name: 'check_out', nullable: true }) checkOut: string | null;
  @Column({ name: 'working_minutes', type: 'int', default: 0 }) workingMinutes: number;
  @Column({ name: 'late_minutes', type: 'int', default: 0 }) lateMinutes: number;
  @Column({ name: 'early_departure_minutes', type: 'int', default: 0 }) earlyDepartureMinutes: number;
  @Column({ name: 'overtime_minutes', type: 'int', default: 0 }) overtimeMinutes: number;
  @Column({ name: 'is_absent', default: false }) isAbsent: boolean;
  @Column({ name: 'is_half_day', default: false }) isHalfDay: boolean;
  @Column({ name: 'lop_days', type: 'numeric', precision: 4, scale: 2, default: 0 }) lopDays: number;
  @Column({ name: 'comp_off_earned', type: 'numeric', precision: 4, scale: 2, default: 0 }) compOffEarned: number;
  @Column({ name: 'status', length: 50, default: 'EVALUATED' }) status: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
