import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Ph-97 — Account hierarchy tree (header).
 * Oracle equivalent: GL Account Hierarchies / Trees used for reporting roll-ups.
 * A tenant may have several trees (statutory, management, tax) over the same COA.
 */
@Entity('fin_gl_account_trees')
@Index(['tenantId', 'code'], { unique: true })
export class AccountTree {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 20, default: 'v1' })
  version: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/**
 * Ph-97 — node in an account tree.
 * A node is either a rollup (label only, accountId null) or a leaf that maps
 * to a real GL account (accountId set). Balances roll up from leaves to parents.
 */
@Entity('fin_gl_account_tree_nodes')
@Index(['tenantId', 'treeId'])
@Index(['tenantId', 'parentNodeId'])
export class AccountTreeNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'tree_id', type: 'uuid' })
  treeId: string;

  @Column({ name: 'parent_node_id', type: 'uuid', nullable: true })
  parentNodeId: string | null;

  @Column({ length: 200 })
  label: string;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null; // null = rollup node, set = leaf account

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
