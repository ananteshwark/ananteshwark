import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AdjustmentStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

@Entity('inv_stock_adjustments')
@Index(['tenantId', 'adjNumber'], { unique: true })
export class StockAdjustment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'adj_number', length: 50 }) adjNumber: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'adj_date', type: 'date' }) adjDate: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'enum', enum: AdjustmentStatus, default: AdjustmentStatus.DRAFT }) status: AdjustmentStatus;
  @Column({ type: 'jsonb', default: [] }) lines: any[];
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
