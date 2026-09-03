import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-198 — A line item suppliers bid on within a sourcing event.
 */
@Entity('proc_event_lines')
@Index(['tenantId', 'eventId', 'lineNo'])
export class SourcingEventLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'line_no', type: 'int' })
  lineNo: number;

  @Column({ name: 'item_code', length: 60, nullable: true })
  itemCode: string | null;

  @Column({ length: 300 })
  description: string;

  @Column({ type: 'numeric', precision: 18, scale: 3, default: 1, transformer: decimalTransformer })
  quantity: number;

  @Column({ length: 20, default: 'EA' })
  uom: string;

  @Column({ name: 'target_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  targetPrice: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
