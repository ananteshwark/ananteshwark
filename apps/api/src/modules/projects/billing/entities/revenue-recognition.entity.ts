import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum RecognitionMethod {
  POC = 'POC',                             // percentage of completion
  COMPLETED_CONTRACT = 'COMPLETED_CONTRACT',
  MILESTONE = 'MILESTONE',
}

/**
 * Ph-241 — A revenue recognition entry for a project period.
 */
@Entity('pjt_revenue_recognition')
@Index(['tenantId', 'projectId', 'period'])
export class RevenueRecognitionEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ type: 'enum', enum: RecognitionMethod })
  method: RecognitionMethod;

  @Column({ name: 'contract_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  contractValue: number;

  @Column({ name: 'poc_pct', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  pocPct: number;

  @Column({ name: 'recognized_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  recognizedAmount: number;

  @Column({ name: 'cumulative_recognized', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  cumulativeRecognized: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
}
