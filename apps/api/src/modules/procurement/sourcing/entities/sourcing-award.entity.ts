import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-200/201 — An award of (part of) a sourcing line to a supplier. Multiple
 * awards per line model split awards. `poRef` is set on conversion to a PO.
 */
@Entity('proc_sourcing_awards')
@Index(['tenantId', 'eventId', 'lineId'])
export class SourcingAward {
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

  @Column({ name: 'awarded_qty', type: 'numeric', precision: 18, scale: 3, default: 0, transformer: decimalTransformer })
  awardedQty: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  unitPrice: number;

  @Column({ name: 'split_pct', type: 'numeric', precision: 5, scale: 2, default: 100, transformer: decimalTransformer })
  splitPct: number;

  @Column({ name: 'po_ref', length: 40, nullable: true })
  poRef: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
