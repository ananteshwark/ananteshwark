import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_sweep_logs')
@Index(['tenantId', 'sweepRuleId'])
export class SweepLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'sweep_rule_id', type: 'uuid' }) sweepRuleId: string;
  @Column({ name: 'run_at', type: 'timestamp' }) runAt: Date;
  @Column({ name: 'amount_transferred', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amountTransferred: number;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'source_balance_before', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) sourceBalanceBefore: number;
  @Column({ name: 'source_balance_after', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) sourceBalanceAfter: number;
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  @CreateDateColumn() createdAt: Date;
}
