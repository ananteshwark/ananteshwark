import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ConsolidationRunStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('fin_consolidation_runs')
@Index(['tenantId', 'createdAt'])
export class ConsolidationRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'group_name', length: 200 })
  groupName: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({
    type: 'enum',
    enum: ConsolidationRunStatus,
    default: ConsolidationRunStatus.PENDING,
  })
  status: ConsolidationRunStatus;

  // Consolidated totals
  @Column({
    name: 'total_revenue',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalRevenue: number;

  @Column({
    name: 'total_expenses',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalExpenses: number;

  @Column({
    name: 'net_income',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  netIncome: number;

  @Column({
    name: 'total_assets',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAssets: number;

  @Column({
    name: 'total_liabilities',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalLiabilities: number;

  @Column({
    name: 'total_equity',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalEquity: number;

  @Column({
    name: 'ic_eliminations',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  icEliminations: number;

  // Full result stored as JSON (account-by-account breakdown)
  @Column({ name: 'result_json', type: 'json', nullable: true })
  resultJson: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'run_by_id', type: 'uuid', nullable: true })
  runById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
