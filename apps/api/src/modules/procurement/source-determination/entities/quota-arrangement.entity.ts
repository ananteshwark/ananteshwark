import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum QuotaArrangementStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface QuotaItem {
  vendorId: string;
  vendorName: string;
  quotaPercentage: number;
  /** Optional hard cap per period */
  maxQuantity?: number | null;
  /** Running allocated quantity in the current period (updated on each determination) */
  allocatedQty: number;
  /** Fallback priority if quota is exhausted */
  priority: number;
}

@Entity('proc_quota_arrangements')
@Index(['tenantId', 'itemId'])
export class QuotaArrangement {
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

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @Column({
    type: 'enum',
    enum: QuotaArrangementStatus,
    default: QuotaArrangementStatus.ACTIVE,
  })
  status: QuotaArrangementStatus;

  @Column({ type: 'jsonb', default: '[]' })
  items: QuotaItem[];

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
