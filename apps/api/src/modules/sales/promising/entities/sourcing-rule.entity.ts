import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SourceType {
  ORGANIZATION = 'ORGANIZATION', // transfer from another inventory org
  VENDOR = 'VENDOR', // buy
  MAKE = 'MAKE', // produce
}

/**
 * Ph-150 — Sourcing rule for Global Order Promising.
 * Ranks the preferred supply source(s) for an item (or category). Lower rank =
 * higher priority; promising tries sources in rank order.
 */
@Entity('scm_sourcing_rules')
@Index(['tenantId', 'itemId', 'rank'])
export class SourcingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'item_category_id', type: 'uuid', nullable: true })
  itemCategoryId: string | null;

  @Column({ name: 'source_type', type: 'enum', enum: SourceType })
  sourceType: SourceType;

  @Column({ name: 'source_org_id', type: 'uuid', nullable: true })
  sourceOrgId: string | null;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @Column({ type: 'int', default: 1 })
  rank: number;

  @Column({ name: 'lead_time_days', type: 'int', default: 0 })
  leadTimeDays: number;

  @Column({ name: 'allocation_pct', type: 'int', default: 100 })
  allocationPct: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
