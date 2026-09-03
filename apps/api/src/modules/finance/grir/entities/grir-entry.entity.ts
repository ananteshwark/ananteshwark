import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum GrirType {
  GR = 'GR',
  IV = 'IV',
}

export enum GrirStatus {
  OPEN = 'OPEN',
  CLEARED = 'CLEARED',
}

@Entity('fin_grir_entries')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'poId'])
export class GrirEntry {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'tenant_id' }) tenantId: string;

  @Column({ name: 'po_id', nullable: true }) poId: string | null;

  @Column({ name: 'po_line_id', nullable: true }) poLineId: string | null;

  @Column({ name: 'grn_id', nullable: true }) grnId: string | null;

  @Column({ name: 'bill_id', nullable: true }) billId: string | null;

  @Column({ name: 'item_id', nullable: true }) itemId: string | null;

  @Column({ name: 'item_description', nullable: true }) itemDescription: string | null;

  @Column({
    name: 'quantity',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantity: number;

  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 18,
    scale: 6,
    default: 0,
    transformer: decimalTransformer,
  })
  unitCost: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  totalAmount: number;

  @Column({ type: 'enum', enum: GrirType }) type: GrirType;

  @Column({ type: 'enum', enum: GrirStatus, default: GrirStatus.OPEN }) status: GrirStatus;

  @Column({ name: 'cleared_with', nullable: true }) clearedWith: string | null;

  @Column({ name: 'cleared_at', type: 'timestamp', nullable: true }) clearedAt: Date | null;

  @Column({ name: 'posting_date', type: 'date', nullable: true }) postingDate: string | null;

  @CreateDateColumn() createdAt: Date;

  @UpdateDateColumn() updatedAt: Date;
}
