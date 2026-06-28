import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum WoPartStatus {
  RESERVED = 'RESERVED',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-164 — Parts reserved for a maintenance work order, issued on completion.
 */
@Entity('maint_wo_parts')
@Index(['tenantId', 'maintenanceOrderId'])
export class WorkOrderPart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'maintenance_order_id', type: 'uuid' })
  maintenanceOrderId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'item_name', length: 200, nullable: true })
  itemName: string | null;

  @Column({ name: 'qty_reserved', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  qtyReserved: number;

  @Column({ name: 'qty_issued', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  qtyIssued: number;

  @Column({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  unitCost: number;

  @Column({ type: 'enum', enum: WoPartStatus, default: WoPartStatus.RESERVED })
  status: WoPartStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
