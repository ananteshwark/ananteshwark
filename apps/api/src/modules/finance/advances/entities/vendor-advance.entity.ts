import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum VendorAdvanceStatus {
  REQUESTED = 'REQUESTED',
  PAID = 'PAID',
  PARTIALLY_CLEARED = 'PARTIALLY_CLEARED',
  CLEARED = 'CLEARED',
}

@Entity('fin_vendor_advances')
@Index(['tenantId', 'vendorId'])
export class VendorAdvance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'vendor_id', type: 'varchar' })
  vendorId: string;

  @Column({ name: 'request_date', type: 'date' })
  requestDate: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  amount: number;

  @Column({
    name: 'paid_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  paidAmount: number;

  @Column({
    name: 'cleared_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  clearedAmount: number;

  @Column({
    type: 'enum',
    enum: VendorAdvanceStatus,
    default: VendorAdvanceStatus.REQUESTED,
  })
  status: VendorAdvanceStatus;

  @Column({ length: 200, nullable: true })
  reference: string | null;

  /** Bill the advance was last cleared against. */
  @Column({ name: 'bill_id', type: 'uuid', nullable: true })
  billId: string | null;

  @Column({ name: 'paid_date', type: 'date', nullable: true })
  paidDate: string | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
