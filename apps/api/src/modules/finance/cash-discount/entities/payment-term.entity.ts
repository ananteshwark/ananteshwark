import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/** One discount tier: e.g. { discountPercent: 2, withinDays: 10 } */
export interface CashDiscountTier {
  discountPercent: number;
  withinDays: number;
}

/**
 * Reusable payment term referenced by code on vendors / customers.
 * Encodes the net due window plus an ordered list of early-payment
 * cash-discount tiers (SAP-style "2/10 net 30").
 */
@Entity('fin_payment_terms')
@Index(['tenantId', 'code'], { unique: true })
export class PaymentTerm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 30 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'net_days', type: 'int', default: 30 })
  netDays: number;

  /** Ordered best-to-worst: [{ discountPercent: 2, withinDays: 10 }, { discountPercent: 1, withinDays: 20 }] */
  @Column({ type: 'jsonb', default: '[]' })
  tiers: CashDiscountTier[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
