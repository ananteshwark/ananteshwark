import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_po_lines')
export class PoLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

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
    transformer: decimalTransformer,
  })
  unitPrice: number;

  @Column({
    name: 'tax_rate',
    type: 'numeric',
    precision: 5,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxRate: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount: number;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  lineTotal: number;

  @Column({
    name: 'quantity_received',
    type: 'numeric',
    precision: 18,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  quantityReceived: number;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @Column({ name: 'requisition_line_id', type: 'uuid', nullable: true })
  requisitionLineId: string | null;

  // ─── Phase 33: Service Procurement (additive) ───
  @Column({ name: 'is_service', type: 'boolean', default: false })
  isService: boolean;

  @Column({ name: 'service_uom', length: 20, nullable: true })
  serviceUom: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
