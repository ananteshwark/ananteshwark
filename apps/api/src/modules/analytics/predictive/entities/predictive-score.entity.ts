import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PredictiveModel {
  CHURN_RISK = 'CHURN_RISK',
  LATE_PAYMENT = 'LATE_PAYMENT',
  DEMAND_FORECAST = 'DEMAND_FORECAST',
}

/**
 * Ph-255 — A persisted predictive score for a subject (customer/invoice/item).
 */
@Entity('anl_predictive_scores')
@Index(['tenantId', 'model', 'subjectId'], { unique: true })
export class PredictiveScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: PredictiveModel })
  model: PredictiveModel;

  @Column({ name: 'subject_id', type: 'varchar' })
  subjectId: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  score: number; // 0–100 risk/probability

  @Column({ length: 20 })
  band: string; // LOW / MEDIUM / HIGH

  @Column({ type: 'jsonb', default: [] })
  factors: Array<{ factor: string; contribution: number }>;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
