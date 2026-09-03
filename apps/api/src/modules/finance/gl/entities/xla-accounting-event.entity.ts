import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { SlaEventClass } from './sla-rule.entity';

/**
 * Immutable audit record: every GL account assignment made by the SLA engine
 * is traced back to its source document and the rule that derived it.
 */
@Entity('fin_xla_accounting_events')
@Index(['tenantId', 'sourceDocumentId'])
@Index(['tenantId', 'journalEntryId'])
@Index(['tenantId', 'eventClass', 'createdAt'])
export class XlaAccountingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'event_class', type: 'enum', enum: SlaEventClass })
  eventClass: SlaEventClass;

  @Column({ name: 'source_document_id', length: 36 })
  sourceDocumentId: string;

  @Column({ name: 'source_document_type', length: 50 })
  sourceDocumentType: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'journal_line_id', type: 'uuid', nullable: true })
  journalLineId: string | null;

  @Column({ name: 'sla_rule_id', type: 'uuid', nullable: true })
  slaRuleId: string | null;

  @Column({ name: 'sla_rule_name', length: 100, nullable: true })
  slaRuleName: string | null;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'account_code', length: 20, nullable: true })
  accountCode: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  credit: number;

  @Column({ name: 'event_data', type: 'jsonb', nullable: true })
  eventData: any | null;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
