import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_rfq_lines')
export class RfqLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'rfq_id', type: 'uuid' })
  rfqId: string;

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

  @Column({ name: 'requisition_line_id', type: 'uuid', nullable: true })
  requisitionLineId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
