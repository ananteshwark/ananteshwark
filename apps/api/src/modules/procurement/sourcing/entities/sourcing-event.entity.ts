import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum SourcingEventType {
  RFI = 'RFI',
  RFQ = 'RFQ',
  AUCTION = 'AUCTION', // reverse auction
}

export enum SourcingEventStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  BIDDING = 'BIDDING',
  SCORING = 'SCORING',
  AWARDED = 'AWARDED',
  CANCELLED = 'CANCELLED',
}

export enum BidVisibility {
  SEALED = 'SEALED', // bids hidden from other suppliers until close
  OPEN = 'OPEN',     // open/reverse-auction visibility
}

/**
 * Ph-198 — A sourcing event (RFI / RFQ / reverse auction) with multi-round
 * bidding and weighted award criteria.
 */
@Entity('proc_sourcing_events')
@Index(['tenantId', 'eventNumber'], { unique: true })
export class SourcingEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'event_number', length: 40 })
  eventNumber: string;

  @Column({ name: 'event_type', type: 'enum', enum: SourcingEventType, default: SourcingEventType.RFQ })
  eventType: SourcingEventType;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: SourcingEventStatus, default: SourcingEventStatus.DRAFT })
  status: SourcingEventStatus;

  @Column({ type: 'enum', enum: BidVisibility, default: BidVisibility.SEALED })
  visibility: BidVisibility;

  @Column({ name: 'current_round', type: 'int', default: 1 })
  currentRound: number;

  @Column({ name: 'weight_price', type: 'numeric', precision: 5, scale: 2, default: 0.6, transformer: decimalTransformer })
  weightPrice: number;

  @Column({ name: 'weight_quality', type: 'numeric', precision: 5, scale: 2, default: 0.2, transformer: decimalTransformer })
  weightQuality: number;

  @Column({ name: 'weight_delivery', type: 'numeric', precision: 5, scale: 2, default: 0.2, transformer: decimalTransformer })
  weightDelivery: number;

  @Column({ name: 'open_date', type: 'date', nullable: true })
  openDate: string | null;

  @Column({ name: 'close_date', type: 'date', nullable: true })
  closeDate: string | null;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
