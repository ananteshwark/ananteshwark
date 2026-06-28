import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum WarrantyStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  VOID = 'VOID',
}

/**
 * Ph-166 — Asset warranty. Work orders within the warranty window can be flagged
 * for claim against the provider.
 */
@Entity('maint_warranties')
@Index(['tenantId', 'equipmentId'])
export class AssetWarranty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'equipment_id', type: 'uuid' })
  equipmentId: string;

  @Column({ length: 200 })
  provider: string;

  @Column({ name: 'policy_number', length: 100, nullable: true })
  policyNumber: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ type: 'text', nullable: true })
  terms: string | null;

  @Column({ name: 'claim_count', type: 'int', default: 0 })
  claimCount: number;

  @Column({ name: 'claimed_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  claimedAmount: number;

  @Column({ type: 'enum', enum: WarrantyStatus, default: WarrantyStatus.ACTIVE })
  status: WarrantyStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
