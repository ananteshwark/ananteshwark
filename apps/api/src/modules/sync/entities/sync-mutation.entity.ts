import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SyncMutationStatus {
  APPLIED = 'APPLIED',
  FAILED = 'FAILED',
}

/**
 * Mutation log for offline-first clients. A device replays its outbox after
 * reconnecting; the unique (tenant, device, clientMutationId) key means every
 * queued action executes exactly once — retries get the stored outcome back
 * instead of double-creating documents.
 */
@Entity('sync_mutations')
@Index(['tenantId', 'deviceId', 'clientMutationId'], { unique: true })
export class SyncMutation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'device_id', length: 100 }) deviceId: string;
  @Column({ name: 'client_mutation_id', length: 100 }) clientMutationId: string;
  @Column({ length: 100 }) type: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) payload: Record<string, any>;
  @Column({ type: 'enum', enum: SyncMutationStatus }) status: SyncMutationStatus;
  @Column({ type: 'jsonb', nullable: true }) result: Record<string, any> | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @CreateDateColumn() createdAt: Date;
}
