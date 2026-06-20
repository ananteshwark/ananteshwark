import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ProductionOrderStatus {
  PLANNED    = 'PLANNED',
  RELEASED   = 'RELEASED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED  = 'COMPLETED',
  CANCELLED  = 'CANCELLED',
}

@Entity('mfg_production_orders')
@Index(['tenantId', 'orderNumber'], { unique: true })
export class ProductionOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'order_number', length: 50 }) orderNumber: string;
  @Column({ name: 'bom_id', type: 'uuid' }) bomId: string;
  @Column({ name: 'finished_item_code', length: 100 }) finishedItemCode: string;
  @Column({ name: 'finished_item_name' }) finishedItemName: string;
  @Column({ name: 'planned_quantity', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) plannedQuantity: number;
  @Column({ name: 'produced_quantity', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) producedQuantity: number;
  @Column({ name: 'scrap_quantity', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) scrapQuantity: number;
  @Column({ name: 'uom', length: 20, default: 'EA' }) uom: string;
  @Column({ name: 'planned_start_date', type: 'date' }) plannedStartDate: string;
  @Column({ name: 'planned_end_date', type: 'date' }) plannedEndDate: string;
  @Column({ name: 'actual_start_date', type: 'date', nullable: true }) actualStartDate: string | null;
  @Column({ name: 'actual_end_date', type: 'date', nullable: true }) actualEndDate: string | null;
  @Column({ name: 'work_center_id', type: 'uuid', nullable: true }) workCenterId: string | null;
  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true }) salesOrderId: string | null;
  @Column({ type: 'enum', enum: ProductionOrderStatus, default: ProductionOrderStatus.PLANNED }) status: ProductionOrderStatus;
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('mfg_material_issuances')
export class MaterialIssuance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'production_order_id', type: 'uuid' }) productionOrderId: string;
  @Column({ name: 'component_code', length: 100 }) componentCode: string;
  @Column({ name: 'component_name' }) componentName: string;
  @Column({ name: 'issued_quantity', type: 'numeric', precision: 18, scale: 6, transformer: decimalTransformer }) issuedQuantity: number;
  @Column({ name: 'uom', length: 20 }) uom: string;
  @Column({ name: 'issued_date', type: 'date' }) issuedDate: string;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
