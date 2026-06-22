import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('mfg_production_confirmations')
export class ProductionConfirmation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'production_order_id', type: 'uuid' }) productionOrderId: string;
  @Column({ name: 'operation_sequence', type: 'int', nullable: true }) operationSequence: number | null;
  @Column({ name: 'work_center_id', type: 'uuid', nullable: true }) workCenterId: string | null;
  @Column({ name: 'confirmed_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) confirmedQty: number;
  @Column({ name: 'actual_minutes', type: 'int', default: 0 }) actualMinutes: number;
  @Column({ name: 'confirmation_date', type: 'date' }) confirmationDate: string;
  @CreateDateColumn() createdAt: Date;
}
