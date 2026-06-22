import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ExitReason {
  RESIGNATION = 'RESIGNATION',
  RETIREMENT = 'RETIREMENT',
  TERMINATION = 'TERMINATION',
  OTHER = 'OTHER',
}

export enum ExitStatus {
  INITIATED = 'INITIATED',
  IN_CLEARANCE = 'IN_CLEARANCE',
  SETTLED = 'SETTLED',
  COMPLETED = 'COMPLETED',
}

@Entity('hr_exit_requests')
@Index(['employeeId', 'tenantId'])
export class ExitRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'last_working_date', type: 'date' })
  lastWorkingDate: string;

  @Column({ type: 'enum', enum: ExitReason, default: ExitReason.RESIGNATION })
  reason: ExitReason;

  @Column({ name: 'exit_interview_date', type: 'date', nullable: true })
  exitInterviewDate: string | null;

  @Column({ type: 'enum', enum: ExitStatus, default: ExitStatus.INITIATED })
  status: ExitStatus;

  @Column({ name: 'rehire_eligible', type: 'boolean', nullable: true })
  rehireEligible: boolean | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
