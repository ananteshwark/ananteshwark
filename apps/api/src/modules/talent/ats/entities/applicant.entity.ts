import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ApplicantSource {
  DIRECT = 'DIRECT',
  REFERRAL = 'REFERRAL',
  LINKEDIN = 'LINKEDIN',
  JOB_BOARD = 'JOB_BOARD',
  AGENCY = 'AGENCY',
  OTHER = 'OTHER',
}

export enum ApplicantStatus {
  NEW = 'NEW',
  SCREENING = 'SCREENING',
  SHORTLISTED = 'SHORTLISTED',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  INTERVIEW_DONE = 'INTERVIEW_DONE',
  OFFER_MADE = 'OFFER_MADE',
  OFFER_ACCEPTED = 'OFFER_ACCEPTED',
  OFFER_DECLINED = 'OFFER_DECLINED',
  REJECTED = 'REJECTED',
  HIRED = 'HIRED',
  WITHDRAWN = 'WITHDRAWN',
}

@Entity('tal_applicants')
export class Applicant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 20, nullable: true })
  phone: string | null;

  @Column({ name: 'resume_url', type: 'text', nullable: true })
  resumeUrl: string | null;

  @Column({ name: 'cover_letter', type: 'text', nullable: true })
  coverLetter: string | null;

  @Column({ name: 'current_company', length: 200, nullable: true })
  currentCompany: string | null;

  @Column({ name: 'current_designation', length: 200, nullable: true })
  currentDesignation: string | null;

  @Column({ name: 'total_experience', type: 'decimal', precision: 5, scale: 2, nullable: true })
  totalExperience: number | null;

  @Column({ name: 'expected_salary', type: 'decimal', precision: 18, scale: 2, nullable: true })
  expectedSalary: number | null;

  @Column({ type: 'enum', enum: ApplicantSource, default: ApplicantSource.DIRECT })
  source: ApplicantSource;

  @Column({ name: 'referred_by_id', type: 'varchar', nullable: true })
  referredById: string | null;

  @Column({ type: 'enum', enum: ApplicantStatus, default: ApplicantStatus.NEW })
  status: ApplicantStatus;

  @Column({ name: 'application_date', type: 'date' })
  applicationDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
