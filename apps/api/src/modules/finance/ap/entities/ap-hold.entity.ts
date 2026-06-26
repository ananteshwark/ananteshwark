import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ApHoldType {
  PRICE_VARIANCE = 'PRICE_VARIANCE',
  QTY_VARIANCE = 'QTY_VARIANCE',
  QUALITY = 'QUALITY',
  MANUAL = 'MANUAL',
  AWAITING_RECEIPT = 'AWAITING_RECEIPT',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  DUPLICATE = 'DUPLICATE',
}

export enum ApHoldStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
}

/**
 * Ph-99 — AP invoice hold.
 * Oracle equivalent: Payables Invoice Holds. An ACTIVE hold on a bill blocks it
 * from being selected into a payment run and from direct payment.
 */
@Entity('fin_ap_holds')
@Index(['tenantId', 'billId', 'status'])
@Index(['tenantId', 'status'])
export class ApHold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bill_id', type: 'uuid' })
  billId: string;

  @Column({ name: 'hold_type', type: 'enum', enum: ApHoldType })
  holdType: ApHoldType;

  @Column({ type: 'enum', enum: ApHoldStatus, default: ApHoldStatus.ACTIVE })
  status: ApHoldStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'placed_by_id', type: 'uuid', nullable: true })
  placedById: string | null;

  @Column({ name: 'released_by_id', type: 'uuid', nullable: true })
  releasedById: string | null;

  @Column({ name: 'release_reason', type: 'text', nullable: true })
  releaseReason: string | null;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
