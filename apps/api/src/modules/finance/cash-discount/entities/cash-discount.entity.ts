import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum CashDiscountType {
  AP = 'AP', // discount received from vendor (early payment of a bill)
  AR = 'AR', // discount granted to customer (early settlement of an invoice)
}

/**
 * Realised cash-discount record. One row per discount actually taken/granted
 * when a bill/invoice is settled early. Drives the utilisation report.
 */
@Entity('fin_cash_discounts')
@Index(['tenantId', 'type'])
@Index(['tenantId', 'partyId'])
export class CashDiscount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: CashDiscountType })
  type: CashDiscountType;

  /** vendorId (AP) or customerId (AR) */
  @Column({ name: 'party_id', type: 'uuid' })
  partyId: string;

  @Column({ name: 'party_name', length: 200 })
  partyName: string;

  /** billId (AP) or invoiceId (AR) */
  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  @Column({ name: 'document_number', length: 100, nullable: true })
  documentNumber: string | null;

  @Column({ name: 'term_code', length: 30, nullable: true })
  termCode: string | null;

  @Column({
    name: 'base_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  baseAmount: number;

  @Column({
    name: 'discount_percent',
    type: 'numeric',
    precision: 9,
    scale: 4,
    transformer: decimalTransformer,
  })
  discountPercent: number;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  discountAmount: number;

  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate: string | null;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate: string;

  @Column({ name: 'days_taken', type: 'int', nullable: true })
  daysTaken: number | null;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
