import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum SalesOrderStatus {
  DRAFT      = 'DRAFT',
  CONFIRMED  = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  SHIPPED    = 'SHIPPED',
  COMPLETED  = 'COMPLETED',
  CANCELLED  = 'CANCELLED',
}

export enum FulfilmentStatus {
  PENDING    = 'PENDING',
  PARTIAL    = 'PARTIAL',
  FULFILLED  = 'FULFILLED',
}

@Entity('so_sales_orders')
@Index(['tenantId', 'orderNumber'], { unique: true })
export class SalesOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'order_number', length: 50 }) orderNumber: string;

  @Column({ name: 'quote_id', type: 'uuid', nullable: true }) quoteId: string | null;
  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'contact_name', length: 200, nullable: true }) contactName: string | null;

  @Column({ name: 'order_date', type: 'date' }) orderDate: string;
  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true }) expectedDeliveryDate: string | null;
  @Column({ name: 'shipped_date', type: 'date', nullable: true }) shippedDate: string | null;

  @Column({ type: 'enum', enum: SalesOrderStatus, default: SalesOrderStatus.DRAFT }) status: SalesOrderStatus;
  @Column({ name: 'fulfilment_status', type: 'enum', enum: FulfilmentStatus, default: FulfilmentStatus.PENDING })
  fulfilmentStatus: FulfilmentStatus;

  @Column({ name: 'subtotal', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) subtotal: number;
  @Column({ name: 'discount_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) discountAmount: number;
  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) taxAmount: number;
  @Column({ name: 'total', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) total: number;
  @Column({ length: 10, default: 'INR' }) currency: string;

  @Column({ name: 'ar_invoice_id', type: 'uuid', nullable: true }) arInvoiceId: string | null;
  @Column({ name: 'shipping_address', type: 'text', nullable: true }) shippingAddress: string | null;
  @Column({ name: 'billing_address', type: 'text', nullable: true }) billingAddress: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'price_list_id', type: 'uuid', nullable: true }) priceListId: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
