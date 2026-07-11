import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ConnectorType {
  JOB_BOARD = 'JOB_BOARD',       // LinkedIn, Indeed, …
  CALENDAR = 'CALENDAR',         // Google, Outlook
  ASSESSMENT = 'ASSESSMENT',     // HackerRank, Codility, …
}

/** A configured external recruiting connector (provider + credentials ref). */
@Entity('rc_connectors')
@Index(['tenantId', 'type'])
export class RecruitingConnector {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: ConnectorType }) type: ConnectorType;
  @Column({ length: 60 }) provider: string;
  // Non-secret config; credentials are referenced (e.g. { credentialRef }) not stored raw.
  @Column({ type: 'jsonb', default: () => "'{}'" }) config: Record<string, any>;
  @Column({ default: true }) enabled: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum PublicationStatus {
  PENDING = 'PENDING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  CLOSED = 'CLOSED',
}

/** A job posting pushed to an external board via a connector. */
@Entity('rc_job_publications')
@Index(['tenantId', 'jobId'])
export class JobPublication {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'job_id', length: 60 }) jobId: string;
  @Column({ name: 'connector_id', type: 'uuid' }) connectorId: string;
  @Column({ length: 60 }) provider: string;
  @Column({ type: 'enum', enum: PublicationStatus, default: PublicationStatus.PENDING }) status: PublicationStatus;
  @Column({ name: 'external_ref', length: 200, nullable: true }) externalRef: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum AssessmentStatus {
  ORDERED = 'ORDERED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

/** An assessment ordered from an external vendor for a candidate. */
@Entity('rc_assessment_orders')
@Index(['tenantId', 'candidateId'])
@Index(['tenantId', 'externalRef'])
export class AssessmentOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'candidate_id', length: 60 }) candidateId: string;
  @Column({ name: 'connector_id', type: 'uuid' }) connectorId: string;
  @Column({ length: 60 }) provider: string;
  @Column({ name: 'assessment_key', length: 80, nullable: true }) assessmentKey: string | null;
  @Column({ type: 'enum', enum: AssessmentStatus, default: AssessmentStatus.ORDERED }) status: AssessmentStatus;
  @Column({ name: 'external_ref', length: 200, nullable: true }) externalRef: string | null;
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: decimalTransformer }) score: number | null;
  @Column({ name: 'result_url', type: 'text', nullable: true }) resultUrl: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
