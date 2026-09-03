import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * A single scheduled revenue-recognition entry for a performance obligation.
 * For OVER_TIME obligations there is one row per period; for POINT_IN_TIME
 * there is a single row dated when control transfers. Recognising a row posts
 * the journal entry (Dr deferred revenue, Cr revenue) and flips `recognized`.
 */
@Entity('fin_rev_schedules')
@Index(['tenantId', 'obligationId'])
@Index(['tenantId', 'recognized', 'periodEnd'])
export class RevenueSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ name: 'obligation_id', type: 'uuid' })
  obligationId: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({
    name: 'scheduled_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  scheduledAmount: number;

  @Column({ default: false })
  recognized: boolean;

  @Column({ name: 'recognized_date', type: 'date', nullable: true })
  recognizedDate: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
