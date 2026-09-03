import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-242 — A resource in the project resourcing pool with skills, grade, cost
 * rate, and weekly capacity.
 */
@Entity('pjt_resources')
@Index(['tenantId', 'employeeId'], { unique: true })
export class ProjectResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'jsonb', default: [] })
  skills: string[];

  @Column({ length: 20, nullable: true })
  grade: string | null;

  @Column({ name: 'cost_rate', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  costRate: number;

  @Column({ name: 'weekly_capacity_hours', type: 'numeric', precision: 6, scale: 2, default: 40, transformer: decimalTransformer })
  weeklyCapacityHours: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
