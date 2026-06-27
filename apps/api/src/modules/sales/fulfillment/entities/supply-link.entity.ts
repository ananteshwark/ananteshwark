import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum SupplyType {
  DROP_SHIP = 'DROP_SHIP', // supplier ships direct to customer
  BACK_TO_BACK = 'BACK_TO_BACK', // procure/produce-to-order, then ship from stock
}

export enum SupplyDocType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  PRODUCTION_ORDER = 'PRODUCTION_ORDER',
}

export enum SupplyLinkStatus {
  REQUESTED = 'REQUESTED', // SO line needs supply
  ORDERED = 'ORDERED', // supply doc created
  RECEIVED = 'RECEIVED', // supply received (or shipped to customer for drop-ship)
  FULFILLED = 'FULFILLED', // SO line satisfied
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-145/146 — links a sales-order line to its supply document (PO or
 * production order). Drop-ship: supplier delivers to the customer and the
 * receipt directly fulfils the SO line. Back-to-back: supply replenishes stock
 * which then ships normally.
 */
@Entity('so_supply_links')
@Index(['tenantId', 'salesOrderId'])
@Index(['tenantId', 'status'])
export class SupplyLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'sales_order_id', type: 'uuid' })
  salesOrderId: string;

  @Column({ name: 'sales_order_line_id', type: 'uuid' })
  salesOrderLineId: string;

  @Column({ name: 'supply_type', type: 'enum', enum: SupplyType })
  supplyType: SupplyType;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'fulfilled_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  fulfilledQty: number;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @Column({ name: 'supply_doc_type', type: 'enum', enum: SupplyDocType, nullable: true })
  supplyDocType: SupplyDocType | null;

  @Column({ name: 'supply_doc_id', type: 'uuid', nullable: true })
  supplyDocId: string | null;

  @Column({ name: 'supply_doc_number', length: 50, nullable: true })
  supplyDocNumber: string | null;

  @Column({ type: 'enum', enum: SupplyLinkStatus, default: SupplyLinkStatus.REQUESTED })
  status: SupplyLinkStatus;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
