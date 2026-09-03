import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-206 — A cell of the spend cube: committed (PO) and actual (invoice) spend
 * by supplier × category × cost center × period.
 */
@Entity('proc_spend_summary')
@Index(['tenantId', 'supplierId', 'category', 'costCenter', 'period'], { unique: true })
export class SpendSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'supplier_id', type: 'varchar' })
  supplierId: string;

  @Column({ name: 'supplier_name', length: 200, nullable: true })
  supplierName: string | null;

  @Column({ length: 80, default: 'UNCATEGORIZED' })
  category: string;

  @Column({ name: 'cost_center', length: 80, default: 'UNASSIGNED' })
  costCenter: string;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ name: 'committed_spend', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  committedSpend: number;

  @Column({ name: 'actual_spend', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  actualSpend: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
