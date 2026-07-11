import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/** A registered corporate card whose transaction feed is ingested. */
@Entity('ex_card_feeds')
@Index(['tenantId', 'active'])
export class CardFeed {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 40 }) provider: string; // amex | visa | hdfc | ...
  @Column({ name: 'card_last4', length: 4 }) cardLast4: string;
  @Column({ name: 'holder_employee_id', type: 'uuid', nullable: true }) holderEmployeeId: string | null;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum CardTxnStatus {
  UNMATCHED = 'UNMATCHED',
  MATCHED = 'MATCHED',
  RECONCILED = 'RECONCILED',
  DISPUTED = 'DISPUTED',
}

@Entity('ex_card_transactions')
@Index(['tenantId', 'feedId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'externalRef'], { unique: true })
export class CardTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'feed_id', type: 'uuid' }) feedId: string;
  @Column({ name: 'external_ref', length: 200 }) externalRef: string;
  @Column({ name: 'posted_date', type: 'date' }) postedDate: string;
  @Column({ length: 200 }) merchant: string;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ type: 'enum', enum: CardTxnStatus, default: CardTxnStatus.UNMATCHED }) status: CardTxnStatus;
  @Column({ name: 'matched_expense_id', type: 'uuid', nullable: true }) matchedExpenseId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum TripSource {
  UBER = 'UBER',
  OLA = 'OLA',
  TMS = 'TMS',
  OTHER = 'OTHER',
}

export enum TripStatus {
  IMPORTED = 'IMPORTED',
  LINKED = 'LINKED',      // linked to a travel request
  EXPENSED = 'EXPENSED',
}

/** A trip/ride imported from a TMS or cab provider. */
@Entity('ex_trip_imports')
@Index(['tenantId', 'employeeId'])
@Index(['tenantId', 'externalRef'], { unique: true })
export class TripImport {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ type: 'enum', enum: TripSource, default: TripSource.OTHER }) source: TripSource;
  @Column({ name: 'external_ref', length: 200 }) externalRef: string;
  @Column({ name: 'employee_id', type: 'uuid', nullable: true }) employeeId: string | null;
  @Column({ name: 'trip_date', type: 'date' }) tripDate: string;
  @Column({ name: 'from_location', length: 200, nullable: true }) fromLocation: string | null;
  @Column({ name: 'to_location', length: 200, nullable: true }) toLocation: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'travel_request_id', type: 'uuid', nullable: true }) travelRequestId: string | null;
  @Column({ type: 'enum', enum: TripStatus, default: TripStatus.IMPORTED }) status: TripStatus;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
