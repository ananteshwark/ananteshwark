import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A certification: a set of requirements (courses/assessments) that, once all
 * met, issues a time-bound certificate to the learner.
 */
@Entity('ac_certifications')
@Index(['tenantId', 'active'])
export class Certification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Requirements, e.g. [{ type:'COURSE', ref:'course-1' }, { type:'ASSESSMENT', ref:'assess-1', minScore:70 }].
  @Column({ type: 'jsonb', default: () => "'[]'" })
  requirements: Array<{ type: 'COURSE' | 'ASSESSMENT'; ref: string; minScore?: number }>;
  // Certificate validity in months (null = never expires).
  @Column({ name: 'validity_months', type: 'int', nullable: true }) validityMonths: number | null;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum CertEnrollmentStatus {
  ENROLLED = 'ENROLLED',
  IN_PROGRESS = 'IN_PROGRESS',
  CERTIFIED = 'CERTIFIED',
  EXPIRED = 'EXPIRED',
}

@Entity('ac_cert_enrollments')
@Index(['tenantId', 'learnerId'])
@Index(['tenantId', 'certId'])
export class CertEnrollment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'cert_id', type: 'uuid' }) certId: string;
  @Column({ name: 'learner_id', type: 'uuid' }) learnerId: string;
  @Column({ type: 'enum', enum: CertEnrollmentStatus, default: CertEnrollmentStatus.ENROLLED }) status: CertEnrollmentStatus;
  // Requirement refs already satisfied, e.g. [{ ref:'course-1', score:null }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) progress: Array<{ ref: string; score?: number | null }>;
  @Column({ name: 'certificate_ref', length: 200, nullable: true }) certificateRef: string | null;
  @Column({ name: 'certified_at', type: 'timestamptz', nullable: true }) certifiedAt: Date | null;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
