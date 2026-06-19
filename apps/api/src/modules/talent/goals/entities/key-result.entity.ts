import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum KrStatus {
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  BEHIND = 'BEHIND',
  ACHIEVED = 'ACHIEVED',
  CANCELLED = 'CANCELLED',
}

@Entity('tal_key_results')
export class KeyResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'objective_id', type: 'uuid' })
  objectiveId: string;

  @Column({ length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 100, nullable: true })
  metric: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 18, scale: 2 })
  targetValue: number;

  @Column({ name: 'current_value', type: 'decimal', precision: 18, scale: 2, default: 0 })
  currentValue: number;

  @Column({ length: 50, nullable: true })
  unit: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  progress: number;

  @Column({ type: 'enum', enum: KrStatus, default: KrStatus.ON_TRACK })
  status: KrStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
