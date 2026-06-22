import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('mfg_routing_operations')
export class RoutingOperation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'routing_id', type: 'uuid' }) routingId: string;
  @Column({ name: 'sequence', type: 'int' }) sequence: number;
  @Column({ name: 'work_center_id', type: 'uuid' }) workCenterId: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'setup_minutes', type: 'int', default: 0 }) setupMinutes: number;
  @Column({ name: 'run_minutes_per_unit', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: decimalTransformer }) runMinutesPerUnit: number;
  @Column({ name: 'yield_percent', type: 'numeric', precision: 5, scale: 2, default: 100, transformer: decimalTransformer }) yieldPercent: number;
  @CreateDateColumn() createdAt: Date;
}
