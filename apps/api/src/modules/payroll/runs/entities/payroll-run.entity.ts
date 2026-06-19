import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PayrollRunType {
  REGULAR = 'REGULAR',
  OFF_CYCLE = 'OFF_CYCLE',
  BONUS = 'BONUS',
  ARREARS = 'ARREARS',
}

export enum PayrollRunStatus {
  DRAFT = 'DRAFT',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('pay_runs')
export class PayrollRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'pay_period_month', type: 'int' })
  payPeriodMonth: number;

  @Column({ name: 'pay_period_year', type: 'int' })
  payPeriodYear: number;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'pay_date', type: 'date' })
  payDate: string;

  @Column({ name: 'run_type', type: 'enum', enum: PayrollRunType, default: PayrollRunType.REGULAR })
  runType: PayrollRunType;

  @Column({ type: 'enum', enum: PayrollRunStatus, default: PayrollRunStatus.DRAFT })
  status: PayrollRunStatus;

  @Column({ name: 'total_gross', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalGross: number;

  @Column({ name: 'total_deductions', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalDeductions: number;

  @Column({ name: 'total_net', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalNet: number;

  @Column({ name: 'total_employer_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalEmployerCost: number;

  @Column({ name: 'employee_count', type: 'int', default: 0 })
  employeeCount: number;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @Column({ name: 'payment_journal_entry_id', type: 'uuid', nullable: true })
  paymentJournalEntryId: string | null;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
