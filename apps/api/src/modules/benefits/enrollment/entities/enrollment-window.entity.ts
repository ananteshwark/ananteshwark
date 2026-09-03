import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WindowType {
  OPEN = 'OPEN', // annual open enrollment
  NEW_HIRE = 'NEW_HIRE',
  SPECIAL = 'SPECIAL',
}

export enum WindowStatus {
  SCHEDULED = 'SCHEDULED',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Ph-178 — Open enrollment window. Elections are only accepted while a window
 * is OPEN and the date is within [startDate, endDate].
 */
@Entity('ben_enrollment_windows')
@Index(['tenantId', 'status'])
export class EnrollmentWindow {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'window_type', type: 'enum', enum: WindowType, default: WindowType.OPEN })
  windowType: WindowType;

  @Column({ name: 'plan_year', type: 'int' })
  planYear: number;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'enum', enum: WindowStatus, default: WindowStatus.SCHEDULED })
  status: WindowStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
