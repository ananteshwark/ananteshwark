import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AccrualType {
  MANUAL = 'MANUAL',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  PER_LEAVE_YEAR = 'PER_LEAVE_YEAR',
}

/** Auto-granted occasion leaves swept daily by grantOccasionLeaves(). */
export enum OccasionType {
  BIRTHDAY = 'BIRTHDAY',
  ANNIVERSARY = 'ANNIVERSARY',
}

@Entity('hr_leave_types')
@Index(['code', 'tenantId'], { unique: true })
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'accrual_type', type: 'enum', enum: AccrualType, default: AccrualType.MANUAL })
  accrualType: AccrualType;

  @Column({ name: 'accrual_rate', type: 'decimal', precision: 10, scale: 2, default: 0 })
  accrualRate: number;

  @Column({ name: 'max_balance', type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxBalance: number | null;

  @Column({ name: 'max_carry_forward', type: 'decimal', precision: 10, scale: 2, default: 0 })
  maxCarryForward: number;

  @Column({ name: 'is_paid', default: true })
  isPaid: boolean;

  @Column({ name: 'is_encashable', default: false })
  isEncashable: boolean;

  @Column({ name: 'applicable_gender', length: 20, nullable: true })
  applicableGender: string | null;

  @Column({ name: 'min_notice_days', type: 'int', default: 0 })
  minNoticeDays: number;

  @Column({ name: 'max_consecutive_days', type: 'int', nullable: true })
  maxConsecutiveDays: number | null;

  // ── Policy depth ─────────────────────────────────────────────────────────
  // Hourly leave: applications may be filed in hours, converted via hoursPerDay.
  @Column({ name: 'allow_hourly', default: false })
  allowHourly: boolean;

  @Column({ name: 'hours_per_day', type: 'decimal', precision: 4, scale: 2, default: 8 })
  hoursPerDay: number;

  // Sandwich rule: weekends falling inside the applied range count as leave.
  @Column({ name: 'sandwich_rule', default: false })
  sandwichRule: boolean;

  // Date-window restrictions (null = unrestricted).
  @Column({ name: 'max_backdated_days', type: 'int', nullable: true })
  maxBackdatedDays: number | null;

  @Column({ name: 'max_advance_days', type: 'int', nullable: true })
  maxAdvanceDays: number | null;

  // Usage limit per leave year (null = unlimited).
  @Column({ name: 'max_applications_per_year', type: 'int', nullable: true })
  maxApplicationsPerYear: number | null;

  // Interdependent usage: this type is only usable once the referenced
  // type's balance is exhausted (e.g. LWP only after PL runs out).
  @Column({ name: 'requires_exhausted_type_id', type: 'uuid', nullable: true })
  requiresExhaustedTypeId: string | null;

  // Occasion auto-grant (birthday / joining anniversary).
  @Column({ name: 'occasion_type', type: 'enum', enum: OccasionType, nullable: true })
  occasionType: OccasionType | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
