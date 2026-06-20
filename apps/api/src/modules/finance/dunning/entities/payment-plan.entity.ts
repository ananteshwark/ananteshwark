import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PaymentPlanStatus {
  ACTIVE    = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DEFAULTED = 'DEFAULTED',
  CANCELLED = 'CANCELLED',
}

@Entity('ar_payment_plans')
export class PaymentPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) totalAmount: number;
  @Column({ name: 'amount_paid', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) amountPaid: number;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ name: 'installments', type: 'int' }) installments: number;
  @Column({ name: 'frequency', length: 20, default: 'MONTHLY' }) frequency: string;
  @Column({ type: 'enum', enum: PaymentPlanStatus, default: PaymentPlanStatus.ACTIVE }) status: PaymentPlanStatus;
  @Column({ type: 'jsonb', default: [] }) schedule: Array<{ dueDate: string; amount: number; paid: boolean }>;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
