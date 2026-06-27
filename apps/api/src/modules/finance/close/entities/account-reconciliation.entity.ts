import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ReconStatus {
  OPEN = 'OPEN',
  PREPARED = 'PREPARED',
  CERTIFIED = 'CERTIFIED',
  REJECTED = 'REJECTED',
}

/**
 * Ph-132 — Balance-sheet account reconciliation.
 * Compares the GL balance against a supporting schedule (sum of line items),
 * with preparer/reviewer sign-off. A non-zero variance blocks certification.
 */
@Entity('fin_account_reconciliations')
@Index(['tenantId', 'periodId', 'accountId'])
export class AccountReconciliation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'period_id', type: 'uuid' })
  periodId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'close_task_id', type: 'uuid', nullable: true })
  closeTaskId: string | null;

  @Column({ name: 'gl_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  glBalance: number;

  @Column({ name: 'supporting_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  supportingBalance: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  variance: number;

  @Column({ name: 'schedule_items', type: 'jsonb', default: [] })
  scheduleItems: Array<{ description: string; amount: number; reference?: string }>;

  @Column({ type: 'enum', enum: ReconStatus, default: ReconStatus.OPEN })
  status: ReconStatus;

  @Column({ name: 'preparer_id', type: 'uuid', nullable: true })
  preparerId: string | null;

  @Column({ name: 'reviewer_id', type: 'uuid', nullable: true })
  reviewerId: string | null;

  @Column({ name: 'prepared_at', type: 'timestamp', nullable: true })
  preparedAt: Date | null;

  @Column({ name: 'certified_at', type: 'timestamp', nullable: true })
  certifiedAt: Date | null;

  @Column({ name: 'as_of_date', type: 'date', nullable: true })
  asOfDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
