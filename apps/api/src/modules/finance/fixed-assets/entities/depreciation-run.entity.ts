import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum DepreciationRunStatus {
  DRAFT  = 'DRAFT',
  POSTED = 'POSTED',
  REVERSED = 'REVERSED',
}

@Entity('fin_depreciation_runs')
export class DepreciationRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'period_year', type: 'int' }) periodYear: number;
  @Column({ name: 'period_month', type: 'int' }) periodMonth: number;
  @Column({ name: 'run_date', type: 'date' }) runDate: string;
  @Column({ name: 'total_depreciation', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalDepreciation: number;
  @Column({ name: 'asset_count', type: 'int', default: 0 }) assetCount: number;
  @Column({ type: 'enum', enum: DepreciationRunStatus, default: DepreciationRunStatus.DRAFT })
  status: DepreciationRunStatus;
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('fin_depreciation_run_lines')
export class DepreciationRunLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'run_id', type: 'uuid' }) runId: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'asset_id', type: 'uuid' }) assetId: string;
  @Column({ name: 'asset_code', length: 50 }) assetCode: string;
  @Column({ name: 'asset_name' }) assetName: string;
  @Column({ name: 'opening_nbv', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  openingNbv: number;
  @Column({ name: 'depreciation_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  depreciationAmount: number;
  @Column({ name: 'closing_nbv', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  closingNbv: number;
  @CreateDateColumn() createdAt: Date;
}
