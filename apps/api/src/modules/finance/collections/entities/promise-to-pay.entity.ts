import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PromiseStatus {
  OPEN = 'OPEN',
  KEPT = 'KEPT',
  BROKEN = 'BROKEN',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-110 — Promise-to-pay.
 * Oracle equivalent: Collections promise-to-pay tracking.
 */
@Entity('fin_ar_promises')
@Index(['tenantId', 'customerId', 'status'])
export class PromiseToPay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ name: 'amount_promised', type: 'decimal', precision: 18, scale: 2, default: 0 })
  amountPromised: number;

  @Column({ name: 'promise_date', type: 'date' })
  promiseDate: string; // when the customer committed to pay by

  @Column({ type: 'enum', enum: PromiseStatus, default: PromiseStatus.OPEN })
  status: PromiseStatus;

  @Column({ name: 'amount_kept', type: 'decimal', precision: 18, scale: 2, default: 0 })
  amountKept: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'collector_id', type: 'uuid', nullable: true })
  collectorId: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
