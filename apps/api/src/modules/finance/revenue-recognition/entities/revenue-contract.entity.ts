import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum RevenueContractStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * An IFRS 15 / ASC 606 revenue contract. The total transaction price is
 * allocated across one or more performance obligations by their relative
 * standalone selling prices; revenue is recognised per obligation as control
 * transfers (point in time) or over the obligation's service period.
 */
@Entity('fin_rev_contracts')
@Index(['tenantId', 'contractNumber'], { unique: true })
export class RevenueContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_number', length: 50 })
  contractNumber: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @Column({ name: 'customer_name', length: 200, nullable: true })
  customerName: string | null;

  @Column({ name: 'contract_date', type: 'date' })
  contractDate: string;

  @Column({
    name: 'total_transaction_price',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalTransactionPrice: number;

  @Column({
    name: 'recognized_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  recognizedAmount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({
    type: 'enum',
    enum: RevenueContractStatus,
    default: RevenueContractStatus.DRAFT,
  })
  status: RevenueContractStatus;

  /** Optional link to the AR invoice that billed this contract. */
  @Column({ name: 'ar_invoice_id', type: 'uuid', nullable: true })
  arInvoiceId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
