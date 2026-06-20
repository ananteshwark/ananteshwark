import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CycleCountStatus {
  DRAFT     = 'DRAFT',
  COUNTING  = 'COUNTING',
  REVIEWED  = 'REVIEWED',
  POSTED    = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum CycleCountLineStatus {
  PENDING  = 'PENDING',
  COUNTED  = 'COUNTED',
  VARIANCE = 'VARIANCE',
  ACCEPTED = 'ACCEPTED',
}

@Entity('inv_cycle_counts')
@Index(['tenantId'])
export class CycleCount {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'count_number', length: 50 }) countNumber: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'count_date', type: 'date' }) countDate: string;
  @Column({ type: 'enum', enum: CycleCountStatus, default: CycleCountStatus.DRAFT }) status: CycleCountStatus;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}

@Entity('inv_cycle_count_lines')
@Index(['tenantId', 'countId'])
export class CycleCountLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'count_id', type: 'uuid' }) countId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'bin_id', type: 'uuid', nullable: true }) binId: string | null;
  @Column({ name: 'system_qty', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) systemQty: number;
  @Column({ name: 'counted_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) countedQty: number | null;
  @Column({ name: 'variance_qty', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer }) varianceQty: number | null;
  @Column({ type: 'enum', enum: CycleCountLineStatus, default: CycleCountLineStatus.PENDING }) status: CycleCountLineStatus;
}
