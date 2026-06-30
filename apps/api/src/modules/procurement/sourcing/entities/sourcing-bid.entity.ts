import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-199 — A supplier's line-level bid in a given round. Multiple rounds per
 * supplier/line form the bid history (re-round capability).
 */
@Entity('proc_sourcing_bids')
@Index(['tenantId', 'eventId', 'lineId', 'round'])
@Index(['tenantId', 'eventId', 'supplierId'])
export class SourcingBid {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'line_id', type: 'uuid' })
  lineId: string;

  @Column({ name: 'supplier_id', type: 'varchar' })
  supplierId: string;

  @Column({ type: 'int', default: 1 })
  round: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  unitPrice: number;

  @Column({ name: 'lead_time_days', type: 'int', nullable: true })
  leadTimeDays: number | null;

  @Column({ name: 'quality_score', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  qualityScore: number | null; // 0–100, evaluator-assigned

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() submittedAt: Date;
}
