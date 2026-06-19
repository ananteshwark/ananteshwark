import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_payment_allocations')
@Index(['vendorPaymentId'])
@Index(['billId'])
export class PaymentAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'vendor_payment_id', type: 'uuid' })
  vendorPaymentId: string;

  @Column({ name: 'bill_id', type: 'uuid' })
  billId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;
}
