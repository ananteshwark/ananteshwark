import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_source_lists')
@Index(['tenantId', 'itemId', 'vendorId'])
export class SourceList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'item_code', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ name: 'item_description', length: 300, nullable: true })
  itemDescription: string | null;

  @Column({ name: 'vendor_id', length: 100 })
  vendorId: string;

  @Column({ name: 'vendor_name', length: 200, nullable: true })
  vendorName: string | null;

  @Column({ name: 'plant', length: 50, nullable: true })
  plant: string | null;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  /** Lower number = higher priority (1 = first choice) */
  @Column({ type: 'int', default: 1 })
  priority: number;

  /** Mandatory source — this vendor must be used, no alternatives */
  @Column({ name: 'is_fixed', type: 'boolean', default: false })
  isFixed: boolean;

  /** Blocked from procurement */
  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ name: 'info_record_id', type: 'uuid', nullable: true })
  infoRecordId: string | null;

  @Column({ name: 'outline_agreement_id', type: 'uuid', nullable: true })
  outlineAgreementId: string | null;

  @Column({
    name: 'min_order_qty',
    type: 'numeric',
    precision: 18,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  minOrderQty: number | null;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'lead_time_days', type: 'int', default: 0 })
  leadTimeDays: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
