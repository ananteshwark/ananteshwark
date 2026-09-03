import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum LearningProviderType {
  LMS = 'LMS',
  MOOC = 'MOOC',           // Coursera, edX, Udemy
  CONTENT = 'CONTENT',     // content packs
  MEETING = 'MEETING',     // Zoom, Teams for VILT
}

@Entity('le_providers')
@Index(['tenantId', 'type'])
export class LearningProvider {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: LearningProviderType }) type: LearningProviderType;
  @Column({ length: 120 }) name: string;
  @Column({ length: 60 }) provider: string; // coursera | udemy | zoom | teams | scorm | ...
  @Column({ type: 'jsonb', default: () => "'{}'" }) config: Record<string, any>;
  @Column({ default: true }) enabled: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/** A normalized xAPI (Tin Can) statement ingested from an external LMS. */
@Entity('le_xapi_statements')
@Index(['tenantId', 'actorEmail'])
@Index(['tenantId', 'rawId'], { unique: true })
export class XapiStatement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  // Provider's statement id, for idempotent ingest.
  @Column({ name: 'raw_id', length: 200 }) rawId: string;
  @Column({ name: 'actor_email', length: 200 }) actorEmail: string;
  @Column({ length: 40 }) verb: string; // normalized: completed | passed | failed | attempted | experienced
  @Column({ name: 'object_id', length: 300 }) objectId: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) result: Record<string, any>;
  @Column({ default: false }) processed: boolean;
  @CreateDateColumn() createdAt: Date;
}

export enum TrainingMode {
  ILT = 'ILT',   // in-person instructor-led
  VILT = 'VILT', // virtual instructor-led
}

export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('le_training_sessions')
@Index(['tenantId', 'status'])
export class TrainingSession {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) title: string;
  @Column({ type: 'enum', enum: TrainingMode, default: TrainingMode.ILT }) mode: TrainingMode;
  @Column({ name: 'meeting_provider_id', type: 'uuid', nullable: true }) meetingProviderId: string | null;
  @Column({ name: 'start_at', type: 'timestamptz' }) startAt: Date;
  @Column({ name: 'end_at', type: 'timestamptz' }) endAt: Date;
  @Column({ length: 200, nullable: true }) location: string | null;
  @Column({ name: 'join_url', type: 'text', nullable: true }) joinUrl: string | null;
  @Column({ type: 'int', nullable: true }) capacity: number | null;
  @Column({ name: 'enrolled_count', type: 'int', default: 0 }) enrolledCount: number;
  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.SCHEDULED }) status: SessionStatus;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
