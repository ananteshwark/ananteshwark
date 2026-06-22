import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PaymentRunStatus {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
}

@Entity('fin_payment_runs')
@Index(['tenantId'])
export class PaymentRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'run_date', type: 'date' })
  runDate: string;

  @Column({ name: 'posting_date', type: 'date' })
  postingDate: string;

  @Column({ name: 'payment_method', length: 20 })
  paymentMethod: string;

  @Column({ length: 20, default: PaymentRunStatus.PROPOSED })
  status: string;

  @Column({ name: 'bank_account_id', type: 'uuid', nullable: true })
  bankAccountId: string | null;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalAmount: number;

  @Column({ name: 'vendor_count', type: 'int', default: 0 })
  vendorCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
