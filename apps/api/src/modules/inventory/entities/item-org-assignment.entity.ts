import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * Ph-136 — Item ↔ Organization assignment.
 * Controls which items are active in which orgs, with org-specific overrides
 * (planner, standard cost, min/max). Absent assignment = item not stocked there.
 */
@Entity('inv_item_org_assignments')
@Index(['tenantId', 'itemId', 'organizationId'], { unique: true })
export class ItemOrgAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'planner_id', type: 'uuid', nullable: true })
  plannerId: string | null;

  @Column({ name: 'standard_cost', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  standardCost: number | null;

  @Column({ name: 'min_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  minQty: number | null;

  @Column({ name: 'max_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  maxQty: number | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
