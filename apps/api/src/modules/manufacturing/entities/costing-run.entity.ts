import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CostingRunStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('mfg_costing_runs')
export class CostingRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'bom_id', type: 'uuid' }) bomId: string;
  @Column({ name: 'finished_item_code', length: 100 }) finishedItemCode: string;
  @Column({ type: 'enum', enum: CostingRunStatus, default: CostingRunStatus.COMPLETED }) status: CostingRunStatus;
  @Column({ name: 'run_date', type: 'date' }) runDate: string;
  @Column({ name: 'material_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) materialCost: number;
  @Column({ name: 'labor_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) laborCost: number;
  @Column({ name: 'overhead_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) overheadCost: number;
  @Column({ name: 'total_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) totalCost: number;
  @Column({ name: 'previous_standard_cost', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) previousStandardCost: number | null;
  @Column({ name: 'cost_breakdown', type: 'jsonb', nullable: true }) costBreakdown: Record<string, unknown> | null;
  @Column({ name: 'error_message', type: 'text', nullable: true }) errorMessage: string | null;
  @CreateDateColumn() createdAt: Date;
}
