import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum DeliveryStatus {
  DRAFT     = 'DRAFT',
  PICKED    = 'PICKED',
  SHIPPED   = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

@Entity('so_delivery_orders')
@Index(['tenantId', 'deliveryNumber'], { unique: true })
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'delivery_number', length: 50 }) deliveryNumber: string;

  @Column({ name: 'sales_order_id', type: 'uuid' }) salesOrderId: string;
  @Column({ name: 'customer_id', type: 'uuid', nullable: true }) customerId: string | null;
  @Column({ name: 'customer_name', length: 200, nullable: true }) customerName: string | null;

  @Column({ name: 'delivery_date', type: 'date' }) deliveryDate: string;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.DRAFT }) status: DeliveryStatus;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true }) warehouseId: string | null;
  @Column({ length: 200, nullable: true }) carrier: string | null;
  @Column({ name: 'tracking_number', length: 200, nullable: true }) trackingNumber: string | null;

  @Column({ name: 'pod_confirmed_at', type: 'timestamp', nullable: true }) podConfirmedAt: Date | null;
  @Column({ name: 'pod_note', type: 'text', nullable: true }) podNote: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
