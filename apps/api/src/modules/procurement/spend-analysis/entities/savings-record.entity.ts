import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum SavingsSource {
  CONTRACT = 'CONTRACT',
  EVENT = 'EVENT', // sourcing event
  NEGOTIATION = 'NEGOTIATION',
}

/**
 * Ph-207 — A logged savings entry: negotiated vs market price × quantity.
 */
@Entity('proc_savings')
@Index(['tenantId', 'period'])
export class SavingsRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: SavingsSource, default: SavingsSource.NEGOTIATION })
  source: SavingsSource;

  @Column({ name: 'ref_id', length: 80, nullable: true })
  refId: string | null;

  @Column({ name: 'supplier_id', type: 'varchar', nullable: true })
  supplierId: string | null;

  @Column({ length: 200, nullable: true })
  description: string | null;

  @Column({ name: 'market_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  marketPrice: number;

  @Column({ name: 'negotiated_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  negotiatedPrice: number;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 1, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'savings_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  savingsAmount: number;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @CreateDateColumn() createdAt: Date;
}
