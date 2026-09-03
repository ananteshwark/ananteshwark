import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('prj_time_entries')
export class ProjectTimeEntry {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @Column({ name: 'task_id', type: 'uuid', nullable: true }) taskId: string | null;
  @Column({ name: 'employee_id', type: 'varchar' }) employeeId: string;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'numeric', precision: 8, scale: 2, transformer: decimalTransformer }) hours: number;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ default: false }) billable: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
