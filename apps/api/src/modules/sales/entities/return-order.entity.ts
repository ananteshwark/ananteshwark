import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ReturnOrderStatus {
  DRAFT     = 'DRAFT',
  RECEIVED  = 'RECEIVED',
  CREDITED  = 'CREDITED',
  CANCELLED = 'CANCELLED',
}

@Entity('so_return_orders')
@Index(['tenantId', 'returnNumber'], { unique: true })
export class ReturnOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'return_number', length: 50 }) returnNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'customer_name', length: 200, nullable: true }) customerName: string | null;
  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true }) salesOrderId: string | null;
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true }) invoiceId: string | null;

  @Column({ name: 'return_date', type: 'date' }) returnDate: string;
  @Column({ length: 50, default: 'OTHER' }) reason: string; // DEFECTIVE/WRONG_ITEM/NOT_NEEDED/OTHER

  @Column({ type: 'enum', enum: ReturnOrderStatus, default: ReturnOrderStatus.DRAFT }) status: ReturnOrderStatus;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalAmount: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
