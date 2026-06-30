import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum CpqQuoteStatus {
  DRAFT = 'DRAFT',
  PRICED = 'PRICED',
  APPROVAL_PENDING = 'APPROVAL_PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ORDERED = 'ORDERED',
}

/**
 * Ph-221 — A CPQ quote: a configured model with the pricing waterfall applied.
 */
@Entity('cpq_quotes')
@Index(['tenantId', 'quoteNumber'], { unique: true })
export class CpqQuote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'quote_number', length: 40 })
  quoteNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName: string | null;

  @Column({ name: 'model_code', length: 50 })
  modelCode: string;

  @Column({ name: 'selected_options', type: 'jsonb', default: [] })
  selectedOptions: string[];

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'list_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  listPrice: number;

  @Column({ name: 'customer_discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  customerDiscountPct: number;

  @Column({ name: 'volume_discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  volumeDiscountPct: number;

  @Column({ name: 'promo_discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  promoDiscountPct: number;

  @Column({ name: 'net_unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  netUnitPrice: number;

  @Column({ name: 'net_total', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  netTotal: number;

  @Column({ name: 'total_discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer })
  totalDiscountPct: number;

  @Column({ name: 'requires_approval', default: false })
  requiresApproval: boolean;

  @Column({ type: 'enum', enum: CpqQuoteStatus, default: CpqQuoteStatus.DRAFT })
  status: CpqQuoteStatus;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'so_id', type: 'uuid', nullable: true })
  soId: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
