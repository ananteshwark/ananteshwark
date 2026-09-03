import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Stored outcome of a mutating request that carried an Idempotency-Key.
 * A retry with the same key replays the stored response instead of
 * re-executing the handler (and, e.g., creating the document twice).
 */
@Entity('idempotency_keys')
@Index(['tenantId', 'scopeHash'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  // sha256 over (user, method, path, client key) — one slot per logical call.
  @Column({ name: 'scope_hash', length: 64 }) scopeHash: string;
  @Column({ length: 10 }) method: string;
  @Column() path: string;
  // 'in_progress' while the handler runs (reserved before execution so a
  // concurrent duplicate can't also execute), 'done' once the response is
  // stored and replayable.
  @Column({ length: 16, default: 'in_progress' }) status: string;
  @Column({ name: 'response_body', type: 'jsonb', nullable: true }) responseBody: any;
  @CreateDateColumn() createdAt: Date;
}
