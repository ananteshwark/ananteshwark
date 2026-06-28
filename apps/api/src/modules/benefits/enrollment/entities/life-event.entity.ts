import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum LifeEventType {
  HIRE = 'HIRE',
  MARRIAGE = 'MARRIAGE',
  BIRTH = 'BIRTH',
  DIVORCE = 'DIVORCE',
  DEATH = 'DEATH',
  ADOPTION = 'ADOPTION',
  TERMINATION = 'TERMINATION',
}

export enum LifeEventStatus {
  OPEN = 'OPEN', // election window active
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

/**
 * Ph-179 — Life event that triggers a special benefit-election window
 * (default 30 days from the event date).
 */
@Entity('ben_life_events')
@Index(['tenantId', 'employeeId', 'status'])
export class LifeEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'event_type', type: 'enum', enum: LifeEventType })
  eventType: LifeEventType;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: string;

  @Column({ name: 'election_deadline', type: 'date' })
  electionDeadline: string;

  @Column({ type: 'enum', enum: LifeEventStatus, default: LifeEventStatus.OPEN })
  status: LifeEventStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
