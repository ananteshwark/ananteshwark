import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum JobStatus {
  PENDING   = 'PENDING',
  RUNNING   = 'RUNNING',
  COMPLETED = 'COMPLETED',
  DEAD      = 'DEAD', // retries exhausted — needs human attention
}

/**
 * Durable one-shot work: survives restarts and is claimed atomically, so any
 * instance can run any job exactly once. Complements the lease-gated
 * recurring sweeps (which handle periodic work).
 */
@Entity('sys_jobs')
@Index(['status', 'runAt'])
export class JobRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 100 }) type: string;
  @Column({ name: 'tenant_id', nullable: true }) tenantId: string | null;
  @Column({ type: 'jsonb', default: () => "'{}'" }) payload: Record<string, any>;
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.PENDING }) status: JobStatus;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ name: 'max_attempts', type: 'int', default: 3 }) maxAttempts: number;
  @Column({ name: 'run_at', type: 'timestamptz', default: () => 'NOW()' }) runAt: Date;
  @Column({ name: 'locked_by', nullable: true }) lockedBy: string | null;
  @Column({ name: 'last_error', type: 'text', nullable: true }) lastError: string | null;
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
