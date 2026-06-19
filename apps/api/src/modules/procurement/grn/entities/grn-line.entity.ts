import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_grn_lines')
export class GrnLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'grn_id', type: 'uuid' })
  grnId: string;

  @Column({ name: 'po_line_id', type: 'uuid' })
  poLineId: string;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({
    name: 'quantity_ordered',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantityOrdered: number;

  @Column({
    name: 'quantity_received',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantityReceived: number;

  @Column({
    name: 'quantity_accepted',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  quantityAccepted: number;

  @Column({
    name: 'quantity_rejected',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  quantityRejected: number;

  @Column({ name: 'rejection_reason', length: 500, nullable: true })
  rejectionReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
