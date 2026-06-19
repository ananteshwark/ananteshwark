import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

@Entity('crm_quotes')
@Index(['tenantId', 'quoteNumber'], { unique: true })
export class CrmQuote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'quote_number', length: 50 }) quoteNumber: string;
  @Column({ name: 'opportunity_id', type: 'uuid', nullable: true }) opportunityId: string | null;
  @Column({ name: 'contact_id', type: 'uuid', nullable: true }) contactId: string | null;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'quote_date', type: 'date' }) quoteDate: string;
  @Column({ name: 'valid_until', type: 'date', nullable: true }) validUntil: string | null;
  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT }) status: QuoteStatus;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) subtotal: number;
  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) taxAmount: number;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) total: number;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'jsonb', default: [] }) lines: any[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
