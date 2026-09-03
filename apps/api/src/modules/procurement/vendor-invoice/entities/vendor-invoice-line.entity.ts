import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_vendor_invoice_lines')
export class VendorInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({ name: 'po_line_id', type: 'uuid', nullable: true })
  poLineId: string | null;

  @Column({ name: 'grn_line_id', type: 'uuid', nullable: true })
  grnLineId: string | null;

  @Column({ name: 'item_code', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 20, default: 'EA' })
  uom: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    name: 'tax_rate',
    type: 'numeric',
    precision: 8,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  taxRate: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  lineTotal: number;

  @CreateDateColumn()
  createdAt: Date;
}
