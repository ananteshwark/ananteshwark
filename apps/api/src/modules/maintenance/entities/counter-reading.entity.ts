import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum CounterType {
  HOURS  = 'HOURS',
  KM     = 'KM',
  CYCLES = 'CYCLES',
}

@Entity('pm_counter_readings')
@Index(['tenantId', 'equipmentId'])
export class CounterReading {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'equipment_id', type: 'uuid' }) equipmentId: string;
  @Column({ name: 'counter_type', length: 20 }) counterType: string;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) reading: number;
  @Column({ name: 'reading_date', type: 'date' }) readingDate: string;
  @Column({ name: 'recorded_by', type: 'uuid', nullable: true }) recordedBy: string | null;
  @CreateDateColumn() createdAt: Date;
}
