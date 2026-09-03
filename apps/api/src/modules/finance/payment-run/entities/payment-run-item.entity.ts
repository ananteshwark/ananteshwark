import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_payment_run_items')
@Index(['tenantId', 'paymentRunId'])
export class PaymentRunItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'payment_run_id', type: 'uuid' })
  paymentRunId: string;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200 })
  vendorName: string;

  @Column({ name: 'bill_id', type: 'uuid' })
  billId: string;

  @Column({ name: 'bill_number', length: 100 })
  billNumber: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ default: true })
  included: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
