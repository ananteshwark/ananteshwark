import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_invoice_lines')
@Index(['invoiceId'])
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ name: 'line_number', type: 'int', default: 1 })
  lineNumber: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 1, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  unitPrice: number;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 9, scale: 4, default: 0, transformer: decimalTransformer })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  taxAmount: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  lineTotal: number;
}
