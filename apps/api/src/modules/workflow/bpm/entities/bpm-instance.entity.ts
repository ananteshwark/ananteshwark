import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum BpmInstanceStatus {
  RUNNING = 'RUNNING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-256 — A running instance of a BPM process against a subject document.
 */
@Entity('bpm_instances')
@Index(['tenantId', 'processId'])
@Index(['tenantId', 'status'])
export class BpmInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'process_id', type: 'uuid' })
  processId: string;

  @Column({ name: 'subject_ref', length: 120 })
  subjectRef: string;

  @Column({ type: 'enum', enum: BpmInstanceStatus, default: BpmInstanceStatus.RUNNING })
  status: BpmInstanceStatus;

  @Column({ name: 'current_stage_index', type: 'int', default: 0 })
  currentStageIndex: number;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
