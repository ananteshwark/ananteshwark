import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum JobType {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  INTERN = 'INTERN',
}

export enum JobStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

@Entity('tal_job_postings')
export class JobPosting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  title: string;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @Column({ type: 'enum', enum: JobType, default: JobType.FULL_TIME })
  type: JobType;

  @Column({ default: 1 })
  vacancies: number;

  @Column({ name: 'salary_min', type: 'decimal', precision: 18, scale: 2, nullable: true })
  salaryMin: number | null;

  @Column({ name: 'salary_max', type: 'decimal', precision: 18, scale: 2, nullable: true })
  salaryMax: number | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  requirements: string | null;

  @Column({ length: 200, nullable: true })
  location: string | null;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.DRAFT })
  status: JobStatus;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closing_date', type: 'date', nullable: true })
  closingDate: string | null;

  // Internal Job Posting (IJP): visible to employees only, not external boards.
  @Column({ name: 'internal_only', default: false })
  internalOnly: boolean;

  // Referral bonus paid on a successful hire sourced via referral.
  @Column({ name: 'referral_bonus', type: 'decimal', precision: 18, scale: 2, default: 0 })
  referralBonus: number;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
