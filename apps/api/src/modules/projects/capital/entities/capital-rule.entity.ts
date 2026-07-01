import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { CostTreatment } from './capital-config.entity';

/**
 * Ph-248 — A per-task capitalize/expense rule overriding the project default.
 */
@Entity('pjt_capital_rules')
@Index(['tenantId', 'projectId', 'taskId'], { unique: true })
export class CapitalRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'task_id', type: 'varchar' })
  taskId: string;

  @Column({ type: 'enum', enum: CostTreatment })
  treatment: CostTreatment;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
