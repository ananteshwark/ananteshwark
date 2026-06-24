import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum EdiDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum EdiTransactionStatus {
  RECEIVED = 'RECEIVED',
  PROCESSING = 'PROCESSING',
  PROCESSED = 'PROCESSED',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('platform_edi_transactions')
@Index(['tenantId', 'tradingPartnerId'])
@Index(['tenantId', 'transactionSet'])
export class EdiTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'trading_partner_id' })
  tradingPartnerId: string;

  // EDI transaction set number: 850, 855, 856, 810
  @Column({ name: 'transaction_set', length: 6 })
  transactionSet: string;

  @Column({
    type: 'enum',
    enum: EdiDirection,
  })
  direction: EdiDirection;

  @Column({ name: 'reference_number', length: 50, nullable: true })
  referenceNumber: string | null;

  @Column({ name: 'interchange_control_number', length: 20, nullable: true })
  interchangeControlNumber: string | null;

  @Column({
    type: 'enum',
    enum: EdiTransactionStatus,
    default: EdiTransactionStatus.RECEIVED,
  })
  status: EdiTransactionStatus;

  @Column({ type: 'text', nullable: true, name: 'raw_content' })
  rawContent: string | null;

  @Column({ type: 'json', nullable: true, name: 'parsed_payload' })
  parsedPayload: Record<string, unknown> | null;

  // ID of the ERP object created from this inbound EDI (e.g. vendorInvoiceId)
  @Column({ name: 'linked_entity_type', length: 50, nullable: true })
  linkedEntityType: string | null;

  @Column({ name: 'linked_entity_id', nullable: true })
  linkedEntityId: string | null;

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
