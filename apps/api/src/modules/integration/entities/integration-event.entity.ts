import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum EventStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
}

/**
 * Ph-279 — An outbound integration event delivered through an adapter, with
 * retry accounting and a dead-letter terminal state.
 */
@Entity('integration_events')
@Index(['tenantId', 'adapterId', 'status'])
export class IntegrationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'adapter_id', type: 'uuid' })
  adapterId: string;

  @Column({ name: 'event_type', length: 80 })
  eventType: string;

  @Column({ type: 'jsonb', default: {} })
  payload: any;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.PENDING })
  status: EventStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
