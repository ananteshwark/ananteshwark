import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_requisition_lines')
export class RequisitionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'requisition_id', type: 'uuid' })
  requisitionId: string;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({ name: 'item_code', length: 100, nullable: true })
  itemCode: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 20, default: 'EA' })
  uom: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  unitPrice: number | null;

  @Column({
    name: 'estimated_total',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  estimatedTotal: number | null;

  @Column({ length: 100, nullable: true })
  category: string | null;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
