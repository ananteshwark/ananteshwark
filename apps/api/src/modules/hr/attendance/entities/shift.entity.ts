import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('hr_shifts')
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'start_time', length: 10 })
  startTime: string;

  @Column({ name: 'end_time', length: 10 })
  endTime: string;

  @Column({ name: 'break_minutes', type: 'int', default: 0 })
  breakMinutes: number;

  @Column({ name: 'working_minutes', type: 'int', nullable: true })
  workingMinutes: number | null;

  @Column({ name: 'grace_minutes_late', type: 'int', default: 15 })
  graceMinutesLate: number;

  @Column({ name: 'grace_minutes_early_leave', type: 'int', default: 15 })
  graceMinutesEarlyLeave: number;

  @Column({ name: 'is_night_shift', default: false })
  isNightShift: boolean;

  // Buffer that extends the shift window on either side (late-running work).
  @Column({ name: 'buffer_minutes', type: 'int', default: 0 })
  bufferMinutes: number;

  // Night-shift differential: extra pay percentage for hours worked on this shift.
  @Column({ name: 'night_differential_pct', type: 'numeric', precision: 5, scale: 2, default: 0 })
  nightDifferentialPct: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
