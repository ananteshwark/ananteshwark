import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DisputeStatus {
  OPEN = 'OPEN',
  IN_REVIEW = 'IN_REVIEW',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
}

export enum DisputeReason {
  PRICING = 'PRICING',
  QUALITY = 'QUALITY',
  QUANTITY = 'QUANTITY',
  DELIVERY = 'DELIVERY',
  DUPLICATE = 'DUPLICATE',
  OTHER = 'OTHER',
}

/**
 * Ph-111 — Invoice dispute.
 * Oracle equivalent: Collections dispute management. An OPEN/IN_REVIEW dispute
 * suspends dunning for the disputed invoice.
 */
@Entity('fin_ar_disputes')
@Index(['tenantId', 'invoiceId', 'status'])
@Index(['tenantId', 'status'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ name: 'disputed_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  disputedAmount: number;

  @Column({ type: 'enum', enum: DisputeReason, default: DisputeReason.OTHER })
  reason: DisputeReason;

  @Column({ type: 'enum', enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'resolver_id', type: 'uuid', nullable: true })
  resolverId: string | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @Column({ name: 'raised_by_id', type: 'uuid', nullable: true })
  raisedById: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
