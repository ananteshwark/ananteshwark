import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-239 — An hourly billing rate. A project+resource rate beats a project
 * default (resourceId null), which beats a global default (projectId null).
 */
@Entity('pjt_billing_rates')
@Index(['tenantId', 'projectId', 'resourceId'])
export class BillingRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'resource_id', type: 'varchar', nullable: true })
  resourceId: string | null;

  @Column({ length: 80, nullable: true })
  role: string | null;

  @Column({ name: 'rate_per_hour', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  ratePerHour: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
