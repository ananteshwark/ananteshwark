import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum InterOrgStatus {
  DRAFT = 'DRAFT',
  SHIPPED = 'SHIPPED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-135 — Inter-organization transfer with pricing.
 * Moves stock between inventory orgs with transfer price, freight, tax and an
 * optional intercompany markup. Lifecycle: DRAFT → SHIPPED → RECEIVED.
 */
@Entity('inv_inter_org_transfers')
@Index(['tenantId', 'status'])
export class InterOrgTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'transfer_number', length: 40 })
  transferNumber: string;

  @Column({ name: 'from_org_id', type: 'uuid' })
  fromOrgId: string;

  @Column({ name: 'to_org_id', type: 'uuid' })
  toOrgId: string;

  @Column({ name: 'from_warehouse_id', type: 'uuid', nullable: true })
  fromWarehouseId: string | null;

  @Column({ name: 'to_warehouse_id', type: 'uuid', nullable: true })
  toWarehouseId: string | null;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  unitCost: number; // source org cost

  @Column({ name: 'markup_pct', type: 'numeric', precision: 9, scale: 4, default: 0, transformer: decimalTransformer })
  markupPct: number;

  @Column({ name: 'transfer_price', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  transferPrice: number; // unit cost + markup

  @Column({ name: 'freight_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  freightAmount: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  taxAmount: number;

  @Column({ name: 'total_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalValue: number;

  @Column({ type: 'enum', enum: InterOrgStatus, default: InterOrgStatus.DRAFT })
  status: InterOrgStatus;

  @Column({ name: 'shipped_at', type: 'timestamp', nullable: true })
  shippedAt: Date | null;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
