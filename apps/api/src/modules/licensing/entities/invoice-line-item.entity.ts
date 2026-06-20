import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { LicenseInvoice } from './license-invoice.entity';

export enum LineItemType {
  EMPLOYEE = 'EMPLOYEE',
  MODULE = 'MODULE',
  CONSUMPTION = 'CONSUMPTION',
  OVERAGE = 'OVERAGE',
  DISCOUNT = 'DISCOUNT',
  TAX = 'TAX',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('lic_invoice_line_items')
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'line_type', type: 'enum', enum: LineItemType })
  lineType: LineItemType;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: decimalTransformer,
  })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ name: 'module_key', nullable: true })
  moduleKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: any | null;

  @ManyToOne(() => LicenseInvoice, (invoice) => invoice.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: LicenseInvoice;
}
