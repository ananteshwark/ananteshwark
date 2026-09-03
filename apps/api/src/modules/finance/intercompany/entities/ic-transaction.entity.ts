import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum IcTransactionStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
  ELIMINATED = 'ELIMINATED',
}

/**
 * A single intercompany transaction represents the matched pair of documents:
 * a receivable (IC_AR) booked in the selling entity and a payable (IC_AP)
 * booked in the buying entity. Posting marks both as booked; elimination
 * removes the pair for consolidated reporting.
 */
@Entity('fin_ic_transactions')
@Index(['tenantId', 'icNumber'], { unique: true })
@Index(['tenantId', 'sellingEntityId', 'buyingEntityId'])
export class IcTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'ic_number', length: 50 })
  icNumber: string;

  @Column({ name: 'relationship_id', type: 'uuid', nullable: true })
  relationshipId: string | null;

  @Column({ name: 'selling_entity_id', type: 'uuid' })
  sellingEntityId: string;

  @Column({ name: 'buying_entity_id', type: 'uuid' })
  buyingEntityId: string;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'base_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  baseAmount: number;

  @Column({
    name: 'markup_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  markupAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: IcTransactionStatus,
    default: IcTransactionStatus.DRAFT,
  })
  status: IcTransactionStatus;

  /** Document type booked in the selling entity (receivable side). */
  @Column({ name: 'selling_doc_type', length: 20, default: 'IC_AR' })
  sellingDocType: string;

  /** Document type booked in the buying entity (payable side). */
  @Column({ name: 'buying_doc_type', length: 20, default: 'IC_AP' })
  buyingDocType: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
