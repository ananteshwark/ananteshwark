import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum MaintenancePlanType {
  TIME_BASED    = 'TIME_BASED',
  COUNTER_BASED = 'COUNTER_BASED',
}

@Entity('pm_maintenance_plans')
@Index(['tenantId'])
export class MaintenancePlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ name: 'equipment_id', type: 'uuid' }) equipmentId: string;
  @Column({ name: 'plan_type', type: 'enum', enum: MaintenancePlanType }) planType: MaintenancePlanType;
  @Column({ name: 'frequency_days', type: 'int', nullable: true }) frequencyDays: number | null;
  @Column({ type: 'jsonb', default: [] }) tasks: Array<{ name: string; estimatedHours: number }>;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'next_due_date', type: 'date', nullable: true }) nextDueDate: string | null;
  @Column({ name: 'last_executed_date', type: 'date', nullable: true }) lastExecutedDate: string | null;
  // Counter-based maintenance support (additive)
  @Column({ name: 'trigger_type', length: 20, nullable: true }) triggerType: string | null; // 'TIME' | 'COUNTER'
  @Column({ name: 'counter_type', length: 20, nullable: true }) counterType: string | null; // HOURS/KM/CYCLES
  @Column({ name: 'counter_interval', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) counterInterval: number | null;
  @Column({ name: 'last_counter_reading', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) lastCounterReading: number | null;
  @Column({ name: 'next_due_counter', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) nextDueCounter: number | null;
  @CreateDateColumn() createdAt: Date;
}
