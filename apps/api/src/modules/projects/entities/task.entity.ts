import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

@Entity('prj_tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @Column({ name: 'parent_task_id', type: 'uuid', nullable: true }) parentTaskId: string | null;
  @Column({ length: 300 }) title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'assigned_to_id', type: 'varchar', nullable: true }) assignedToId: string | null;
  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM }) priority: TaskPriority;
  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO }) status: TaskStatus;
  @Column({ name: 'estimated_hours', type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: decimalTransformer }) estimatedHours: number | null;
  @Column({ name: 'actual_hours', type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: decimalTransformer }) actualHours: number | null;
  @Column({ name: 'due_date', type: 'date', nullable: true }) dueDate: string | null;
  @Column({ name: 'completed_at', type: 'timestamp', nullable: true }) completedAt: Date | null;
  @Column({ type: 'jsonb', default: [] }) tags: string[];
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
