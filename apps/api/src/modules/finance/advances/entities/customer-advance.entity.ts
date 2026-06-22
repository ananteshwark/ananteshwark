import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum CustomerAdvanceStatus {
  RECEIVED = 'RECEIVED',
  PARTIALLY_CLEARED = 'PARTIALLY_CLEARED',
  CLEARED = 'CLEARED',
}

@Entity('fin_customer_advances')
@Index(['tenantId', 'customerId'])
export class CustomerAdvance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'customer_id', type: 'varchar' })
  customerId: string;

  @Column({ name: 'receipt_date', type: 'date' })
  receiptDate: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  amount: number;

  @Column({
    name: 'cleared_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  clearedAmount: number;

  @Column({
    type: 'enum',
    enum: CustomerAdvanceStatus,
    default: CustomerAdvanceStatus.RECEIVED,
  })
  status: CustomerAdvanceStatus;

  @Column({ length: 200, nullable: true })
  reference: string | null;

  /** Invoice the advance was last cleared against. */
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
