import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum BgvSubjectType {
  APPLICANT = 'APPLICANT',
  EMPLOYEE  = 'EMPLOYEE',
}

export enum BgvCaseStatus {
  INITIATED   = 'INITIATED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
}

export enum BgvResult {
  PENDING     = 'PENDING',
  CLEAR       = 'CLEAR',
  DISCREPANCY = 'DISCREPANCY',
  FAILED      = 'FAILED',
}

export enum BgvCheckType {
  IDENTITY   = 'IDENTITY',
  ADDRESS    = 'ADDRESS',
  EDUCATION  = 'EDUCATION',
  EMPLOYMENT = 'EMPLOYMENT',
  CRIMINAL   = 'CRIMINAL',
  REFERENCE  = 'REFERENCE',
  CREDIT     = 'CREDIT',
}

export enum BgvCheckStatus {
  PENDING     = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  CLEAR       = 'CLEAR',
  DISCREPANCY = 'DISCREPANCY',
  FAILED      = 'FAILED',
}

@Entity('bgv_cases')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'caseNumber'], { unique: true })
export class BgvCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_number', length: 20 }) caseNumber: string;
  @Column({ name: 'subject_type', type: 'enum', enum: BgvSubjectType }) subjectType: BgvSubjectType;
  @Column({ name: 'subject_id' }) subjectId: string;
  @Column({ name: 'subject_name' }) subjectName: string;
  @Column({ name: 'package_name', nullable: true }) packageName: string | null;
  @Column({ type: 'enum', enum: BgvCaseStatus, default: BgvCaseStatus.INITIATED }) status: BgvCaseStatus;
  @Column({ name: 'overall_result', type: 'enum', enum: BgvResult, default: BgvResult.PENDING })
  overallResult: BgvResult;
  @Column({ name: 'initiated_by_user_id' }) initiatedByUserId: string;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('bgv_checks')
@Index(['tenantId', 'caseId'])
export class BgvCheck {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'case_id' }) caseId: string;
  @Column({ type: 'enum', enum: BgvCheckType }) type: BgvCheckType;
  @Column({ type: 'enum', enum: BgvCheckStatus, default: BgvCheckStatus.PENDING }) status: BgvCheckStatus;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @Column({ name: 'verified_by_user_id', nullable: true }) verifiedByUserId: string | null;
  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
