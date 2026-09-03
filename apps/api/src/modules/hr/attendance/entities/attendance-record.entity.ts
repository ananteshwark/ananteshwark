import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AttendanceSource {
  BIOMETRIC = 'BIOMETRIC',
  MANUAL = 'MANUAL',
  MOBILE = 'MOBILE',
  IMPORT = 'IMPORT',
}

export enum AttendanceStatus {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  HALF_DAY = 'HALF_DAY',
  HOLIDAY = 'HOLIDAY',
  WEEKEND = 'WEEKEND',
  LEAVE = 'LEAVE',
}

@Entity('hr_attendance')
@Index(['tenantId', 'employeeId', 'date'], { unique: true })
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'check_in', type: 'timestamp', nullable: true })
  checkIn: Date | null;

  @Column({ name: 'check_out', type: 'timestamp', nullable: true })
  checkOut: Date | null;

  @Column({ name: 'working_minutes', type: 'int', nullable: true })
  workingMinutes: number | null;

  @Column({ type: 'enum', enum: AttendanceSource, default: AttendanceSource.MANUAL })
  source: AttendanceSource;

  @Column({ type: 'enum', enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  status: AttendanceStatus;

  @Column({ name: 'is_regularized', default: false })
  isRegularized: boolean;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
