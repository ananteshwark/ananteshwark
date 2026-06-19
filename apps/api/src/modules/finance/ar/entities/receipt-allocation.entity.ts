import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_receipt_allocations')
@Index(['customerReceiptId'])
@Index(['invoiceId'])
export class ReceiptAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'customer_receipt_id', type: 'uuid' })
  customerReceiptId: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;
}
