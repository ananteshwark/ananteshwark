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
 * One period of a lease's amortisation schedule. The liability columns track
 * the unwinding of the discount (interest) and principal repayment; the
 * amortisation column is the straight-line ROU charge for the period. Posting a
 * line books the combined journal entry and flips `posted`.
 */
@Entity('fin_lease_schedule_lines')
@Index(['tenantId', 'leaseId'])
@Index(['tenantId', 'posted', 'periodEnd'])
export class LeaseScheduleLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'lease_id', type: 'uuid' })
  leaseId: string;

  @Column({ name: 'period_number', type: 'int' })
  periodNumber: number;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({
    name: 'opening_liability',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  openingLiability: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  payment: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  interest: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  principal: number;

  @Column({
    name: 'closing_liability',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  closingLiability: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amortization: number;

  @Column({ default: false })
  posted: boolean;

  @Column({ name: 'posted_date', type: 'date', nullable: true })
  postedDate: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
