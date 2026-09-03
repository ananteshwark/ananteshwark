import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ResourceRequestStatus {
  OPEN = 'OPEN',
  FULFILLED = 'FULFILLED',
  REJECTED = 'REJECTED',
}

/**
 * Ph-243 — A PM's request for a resource by skill/grade, fulfilled from the pool
 * by a resource manager.
 */
@Entity('pjt_resource_requests')
@Index(['tenantId', 'projectId'])
@Index(['tenantId', 'status'])
export class ResourceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'requested_by', type: 'varchar' })
  requestedBy: string;

  @Column({ length: 80 })
  skill: string;

  @Column({ length: 20, nullable: true })
  grade: string | null;

  @Column({ name: 'hours_needed', type: 'numeric', precision: 8, scale: 2, default: 0, transformer: decimalTransformer })
  hoursNeeded: number;

  @Column({ name: 'start_week', length: 8, nullable: true })
  startWeek: string | null; // YYYY-Www

  @Column({ type: 'enum', enum: ResourceRequestStatus, default: ResourceRequestStatus.OPEN })
  status: ResourceRequestStatus;

  @Column({ name: 'fulfilled_resource_id', type: 'uuid', nullable: true })
  fulfilledResourceId: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
