import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Coverage demand: how many people a shift needs on a given date
 * (optionally scoped to a department).
 */
@Entity('hr_roster_demand')
@Index(['tenantId', 'date'])
export class RosterDemand {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'shift_id' }) shiftId: string;
  @Column({ name: 'shift_name', nullable: true }) shiftName: string | null;
  @Column({ type: 'date' }) date: string;
  @Column({ name: 'required_headcount', type: 'int' }) requiredHeadcount: number;
  @Column({ name: 'department_id', nullable: true }) departmentId: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum RosterEntryStatus {
  DRAFT     = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CANCELLED = 'CANCELLED',
}

export enum RosterSource {
  AUTO   = 'AUTO',
  MANUAL = 'MANUAL',
}

/** One person on one shift on one date. */
@Entity('hr_roster_entries')
@Index(['tenantId', 'date'])
@Index(['tenantId', 'employeeId', 'date'])
export class RosterEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'demand_id' }) demandId: string;
  @Column({ name: 'shift_id' }) shiftId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ name: 'employee_id' }) employeeId: string;
  @Column({ name: 'employee_name', nullable: true }) employeeName: string | null;
  @Column({ type: 'enum', enum: RosterEntryStatus, default: RosterEntryStatus.DRAFT })
  status: RosterEntryStatus;
  @Column({ type: 'enum', enum: RosterSource, default: RosterSource.MANUAL })
  source: RosterSource;
  @CreateDateColumn() createdAt: Date;
}
