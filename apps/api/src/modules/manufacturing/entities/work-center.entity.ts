import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('mfg_work_centers')
export class WorkCenter {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'capacity_per_hour', type: 'numeric', precision: 18, scale: 2, default: 1, transformer: decimalTransformer }) capacityPerHour: number;
  @Column({ name: 'cost_per_hour', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) costPerHour: number;
  @Column({ name: 'capacity_minutes_per_day', type: 'int', nullable: true }) capacityMinutesPerDay: number | null;
  @Column({ name: 'efficiency_percent', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer }) efficiencyPercent: number | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
