import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A ledger group bundles member ledgers that should be reported and closed
 * together (e.g. an IFRS + LOCAL group). The leading ledger of the group is
 * the basis for cross-ledger reconciliation differences.
 */
@Entity('fin_ledger_groups')
@Index(['tenantId', 'code'], { unique: true })
export class LedgerGroup {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 20 }) code: string;
  @Column({ length: 150 }) description: string;
  /** Member ledger codes, e.g. ["MAIN", "IFRS"]. */
  @Column({ name: 'member_ledgers', type: 'jsonb', default: () => "'[]'" }) memberLedgers: string[];
  /** The ledger used as the comparison baseline in reconciliation. */
  @Column({ name: 'leading_ledger', length: 20, nullable: true }) leadingLedger: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
