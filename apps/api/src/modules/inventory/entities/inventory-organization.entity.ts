import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Ph-134 — Inventory Organization.
 * Oracle equivalent: Inventory Organization, distinct from a physical warehouse
 * and tied to a legal entity. Warehouses belong to an org; orgs form a
 * hierarchy used for inter-org access.
 */
@Entity('inv_organizations')
@Index(['tenantId', 'code'], { unique: true })
export class InventoryOrganization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'legal_entity_id', type: 'uuid', nullable: true })
  legalEntityId: string | null;

  @Column({ name: 'parent_org_id', type: 'uuid', nullable: true })
  parentOrgId: string | null;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  /** Costing method that governs items in this org. */
  @Column({ name: 'cost_method', length: 30, default: 'MOVING_AVERAGE' })
  costMethod: string; // MOVING_AVERAGE / STANDARD / FIFO

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
