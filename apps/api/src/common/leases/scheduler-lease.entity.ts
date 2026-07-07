import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * One row per named background job. Whichever instance holds the unexpired
 * lease runs the job; everyone else skips the tick. Renewal is the same
 * atomic upsert as acquisition.
 */
@Entity('scheduler_leases')
export class SchedulerLease {
  @PrimaryColumn({ length: 100 }) name: string;
  @Column({ name: 'holder_id', length: 64 }) holderId: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
