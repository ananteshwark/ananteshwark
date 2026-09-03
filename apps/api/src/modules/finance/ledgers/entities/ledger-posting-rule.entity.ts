import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { JournalSource } from '../../gl/entities/journal-entry.entity';

/**
 * Determines which ledger(s) a transaction source posts to. A source mapped to
 * multiple ledger codes is mirrored into each (e.g. an asset depreciation that
 * differs between IFRS and TAX). With no rule, postings default to the leading
 * ledger only.
 */
@Entity('fin_ledger_posting_rules')
@Index(['tenantId', 'source'], { unique: true })
export class LedgerPostingRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: JournalSource }) source: JournalSource;
  /** Ledger codes this source posts into, e.g. ["MAIN", "IFRS"]. */
  @Column({ name: 'ledger_codes', type: 'jsonb', default: () => "'[]'" }) ledgerCodes: string[];
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
