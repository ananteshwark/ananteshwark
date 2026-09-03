import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Node in a plan's hierarchical budget tree (BU → function → manager). Each
 * node has an allocated amount; a parent can redistribute to children, and a
 * holder can delegate control to another user. Consumption rolls up from the
 * worksheet lines assigned to the node.
 */
@Entity('cmp_merit_budgets')
@Index(['tenantId', 'planId'])
export class MeritBudgetNode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ name: 'parent_id', type: 'uuid', nullable: true }) parentId: string | null;
  // Organisational level this node sits at.
  @Column({ length: 20, default: 'MANAGER' }) level: string; // BU | FUNCTION | MANAGER
  @Column({ length: 200 }) name: string;
  // The org unit / manager this budget belongs to.
  @Column({ name: 'org_unit_id', type: 'uuid', nullable: true }) orgUnitId: string | null;
  @Column({ name: 'holder_user_id', nullable: true }) holderUserId: string | null;
  // Delegate who may act on this node's behalf.
  @Column({ name: 'delegated_to_user_id', nullable: true }) delegatedToUserId: string | null;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'allocated_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  allocatedAmount: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
