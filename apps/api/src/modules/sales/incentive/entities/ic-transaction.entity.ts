import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum IcTransactionStatus {
  CALCULATED = 'CALCULATED',
  DISPUTED = 'DISPUTED',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

/**
 * Ph-226 — A calculated commission transaction for a rep in a period.
 */
@Entity('ic_transactions')
@Index(['tenantId', 'repId', 'period'])
export class IcTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @Column({ name: 'rep_id', type: 'varchar' })
  repId: string;

  @Column({ length: 7 })
  period: string; // YYYY-MM

  @Column({ name: 'booking_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  bookingAmount: number;

  @Column({ name: 'attainment_pct', type: 'numeric', precision: 7, scale: 2, default: 0, transformer: decimalTransformer })
  attainmentPct: number;

  @Column({ name: 'credit_pct', type: 'numeric', precision: 5, scale: 2, default: 100, transformer: decimalTransformer })
  creditPct: number; // split credit share

  @Column({ name: 'applied_rate', type: 'numeric', precision: 6, scale: 4, default: 0, transformer: decimalTransformer })
  appliedRate: number;

  @Column({ name: 'accelerator_mult', type: 'numeric', precision: 5, scale: 2, default: 1, transformer: decimalTransformer })
  acceleratorMult: number;

  @Column({ name: 'gross_commission', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  grossCommission: number;

  @Column({ name: 'draw_recovered', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  drawRecovered: number;

  @Column({ name: 'net_payable', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  netPayable: number;

  @Column({ name: 'product_family', length: 80, nullable: true })
  productFamily: string | null;

  @Column({ type: 'enum', enum: IcTransactionStatus, default: IcTransactionStatus.CALCULATED })
  status: IcTransactionStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
