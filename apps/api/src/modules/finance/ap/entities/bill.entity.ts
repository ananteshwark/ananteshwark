import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BillStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

@Entity('bills')
@Index(['tenantId', 'billNumber'])
export class Bill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bill_number', length: 100 })
  billNumber: string;

  @Column({ name: 'vendor_name', length: 255 })
  vendorName: string;

  @Column({ name: 'bill_date', type: 'date' })
  billDate: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: Date;

  @Column({ type: 'enum', enum: BillStatus, default: BillStatus.DRAFT })
  status: BillStatus;

  @Column({ name: 'sub_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  subTotal: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'tax_code_id', nullable: true })
  taxCodeId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
