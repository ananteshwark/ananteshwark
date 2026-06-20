import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum RequisitionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

@Entity('tal_manpower_requisitions')
export class ManpowerRequisition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'function_id', type: 'uuid', nullable: true })
  functionId: string | null;

  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @Column({ default: 1 })
  vacancies: number;

  @Column({ name: 'employment_type', length: 20, default: 'FULL_TIME' })
  employmentType: string;

  @Column({ type: 'enum', enum: RequisitionPriority, default: RequisitionPriority.MEDIUM })
  priority: RequisitionPriority;

  @Column({ name: 'job_description', type: 'text' })
  jobDescription: string;

  @Column({ type: 'text', nullable: true })
  requirements: string | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'expected_joining_date', type: 'date', nullable: true })
  expectedJoiningDate: string | null;

  @Column({ name: 'budget_min', type: 'decimal', precision: 18, scale: 2, nullable: true })
  budgetMin: number | null;

  @Column({ name: 'budget_max', type: 'decimal', precision: 18, scale: 2, nullable: true })
  budgetMax: number | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'location', length: 200, nullable: true })
  location: string | null;

  @Column({ type: 'enum', enum: RequisitionStatus, default: RequisitionStatus.DRAFT })
  status: RequisitionStatus;

  @Column({ name: 'requested_by_id', type: 'uuid', nullable: true })
  requestedById: string | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'job_posting_id', type: 'uuid', nullable: true })
  jobPostingId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
