import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-244 — A resource's weekly allocation to a project (basis for utilization).
 */
@Entity('pjt_resource_allocations')
@Index(['tenantId', 'resourceId', 'week'])
@Index(['tenantId', 'projectId'])
export class ResourceAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ length: 8 })
  week: string; // YYYY-Www

  @Column({ name: 'allocated_hours', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  allocatedHours: number;

  @Column({ default: true })
  billable: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
