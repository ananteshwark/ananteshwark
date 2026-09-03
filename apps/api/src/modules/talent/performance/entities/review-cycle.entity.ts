import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReviewType {
  ANNUAL = 'ANNUAL',
  MID_YEAR = 'MID_YEAR',
  QUARTERLY = 'QUARTERLY',
  PROBATION = 'PROBATION',
  EXIT = 'EXIT',
}

export enum ReviewCycleStatus {
  PLANNING = 'PLANNING',
  SELF_REVIEW = 'SELF_REVIEW',
  MANAGER_REVIEW = 'MANAGER_REVIEW',
  CALIBRATION = 'CALIBRATION',
  COMPLETED = 'COMPLETED',
}

@Entity('tal_review_cycles')
export class ReviewCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: ReviewType, default: ReviewType.ANNUAL })
  type: ReviewType;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'self_review_deadline', type: 'date' })
  selfReviewDeadline: string;

  @Column({ name: 'manager_review_deadline', type: 'date' })
  managerReviewDeadline: string;

  @Column({ name: 'calibration_date', type: 'date', nullable: true })
  calibrationDate: string | null;

  @Column({ type: 'enum', enum: ReviewCycleStatus, default: ReviewCycleStatus.PLANNING })
  status: ReviewCycleStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
