import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PurchaseReturnStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

@Entity('proc_purchase_returns')
@Index(['tenantId', 'vendorId'])
@Index(['tenantId', 'status'])
export class PurchaseReturn {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'return_number', length: 50, nullable: true })
  returnNumber: string | null;

  @Column({ name: 'grn_id', type: 'uuid', nullable: true })
  grnId: string | null;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId: string | null;

  @Column({ name: 'vendor_id', type: 'uuid' })
  vendorId: string;

  @Column({ name: 'return_date', type: 'date' })
  returnDate: string;

  @Column({ length: 255, nullable: true })
  reason: string | null;

  @Column({ type: 'enum', enum: PurchaseReturnStatus, default: PurchaseReturnStatus.DRAFT })
  status: PurchaseReturnStatus;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
