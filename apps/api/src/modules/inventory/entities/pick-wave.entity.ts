import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum WaveStatus {
  OPEN = 'OPEN',
  RELEASED = 'RELEASED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PickStrategy {
  FIFO = 'FIFO',
  FEFO = 'FEFO',
  ZONE = 'ZONE',
}

@Entity('inv_pick_waves')
@Index(['tenantId', 'warehouseId', 'status'])
export class PickWave {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'wave_number', length: 30 }) waveNumber: string;
  @Column({ type: 'enum', enum: WaveStatus, default: WaveStatus.OPEN }) status: WaveStatus;
  @Column({ name: 'pick_strategy', type: 'enum', enum: PickStrategy, default: PickStrategy.FEFO }) pickStrategy: PickStrategy;
  @Column({ type: 'int', default: 50 }) priority: number;
  @Column({ name: 'released_at', type: 'timestamp', nullable: true }) releasedAt: Date | null;
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true }) completedAt: Date | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
