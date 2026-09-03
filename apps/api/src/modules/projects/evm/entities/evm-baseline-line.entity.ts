import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-245 — A baseline line: the planned value (budget) for a task.
 */
@Entity('pjt_evm_baseline_lines')
@Index(['tenantId', 'baselineId'])
@Index(['tenantId', 'projectId', 'taskId'])
export class EvmBaselineLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'baseline_id', type: 'uuid' })
  baselineId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'task_id', type: 'varchar' })
  taskId: string;

  @Column({ name: 'planned_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  plannedValue: number;

  @Column({ name: 'planned_start', type: 'date', nullable: true })
  plannedStart: string | null;

  @Column({ name: 'planned_finish', type: 'date', nullable: true })
  plannedFinish: string | null;

  @CreateDateColumn() createdAt: Date;
}
