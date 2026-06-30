import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-205 — Periodic supplier KPI scorecard (on-time delivery, quality reject,
 * invoice accuracy) rolled into an overall score.
 */
@Entity('proc_supplier_scorecards')
@Index(['tenantId', 'supplierId', 'period'], { unique: true })
export class SupplierScorecard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'supplier_id', type: 'varchar' })
  supplierId: string;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ name: 'on_time_delivery_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  onTimeDeliveryPct: number;

  @Column({ name: 'quality_reject_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  qualityRejectPct: number;

  @Column({ name: 'invoice_accuracy_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  invoiceAccuracyPct: number;

  @Column({ name: 'overall_score', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  overallScore: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
