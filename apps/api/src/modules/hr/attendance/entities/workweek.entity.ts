import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum BreakType {
  MEAL = 'MEAL',
  REST = 'REST',
}

/**
 * A compliance break rule: once an employee works `minWorkMinutes`, a break of
 * `breakMinutes` is required (e.g. a 30-min meal break after 5 hours).
 */
@Entity('att_break_rules')
@Index(['tenantId', 'active'])
export class BreakRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) name: string;
  @Column({ type: 'enum', enum: BreakType, default: BreakType.MEAL }) type: BreakType;
  @Column({ name: 'min_work_minutes', type: 'int' }) minWorkMinutes: number;
  @Column({ name: 'break_minutes', type: 'int' }) breakMinutes: number;
  @Column({ default: false }) paid: boolean;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum InfractionType {
  LATE = 'LATE',
  NO_SHOW = 'NO_SHOW',
  EARLY_LEAVE = 'EARLY_LEAVE',
  MISSED_PUNCH = 'MISSED_PUNCH',
  MISSED_BREAK = 'MISSED_BREAK',
  LONG_BREAK = 'LONG_BREAK',
}

export enum InfractionStatus {
  OPEN = 'OPEN',
  WAIVED = 'WAIVED',
  ESCALATED = 'ESCALATED',
}

/** An attendance infraction with point value; points accrue toward escalation. */
@Entity('att_infractions')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'date'])
export class AttendanceInfraction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'enum', enum: InfractionType }) type: InfractionType;
  @Column({ type: 'int', default: 1 }) points: number;
  @Column({ type: 'enum', enum: InfractionStatus, default: InfractionStatus.OPEN }) status: InfractionStatus;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A fair-workweek (predictive-scheduling) rule: schedules must be posted
 * `advanceNoticeDays` ahead, employees get `minRestHoursBetweenShifts` between
 * shifts (anti-clopening), and late changes owe `predictabilityPayHours`.
 */
@Entity('att_fair_workweek_rules')
@Index(['tenantId', 'active'])
export class FairWorkweekRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) name: string;
  @Column({ name: 'advance_notice_days', type: 'int', default: 14 }) advanceNoticeDays: number;
  @Column({ name: 'min_rest_hours_between_shifts', type: 'int', default: 11 }) minRestHoursBetweenShifts: number;
  @Column({ name: 'predictability_pay_hours', type: 'int', default: 1 }) predictabilityPayHours: number;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
