import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ContactMethod {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  LETTER = 'LETTER',
  MEETING = 'MEETING',
  NOTE = 'NOTE',
}

/**
 * Ph-109 — Collector contact history / notes against a customer.
 * Oracle equivalent: Collections activity / interaction history.
 */
@Entity('fin_collection_notes')
@Index(['tenantId', 'customerId', 'createdAt'])
export class CollectionNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId: string | null;

  @Column({ name: 'contact_method', type: 'enum', enum: ContactMethod, default: ContactMethod.NOTE })
  contactMethod: ContactMethod;

  @Column({ type: 'text' })
  note: string;

  @Column({ name: 'collector_id', type: 'uuid', nullable: true })
  collectorId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
