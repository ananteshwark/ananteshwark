import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-188 — An employee's proficiency (1–5) in a catalog skill.
 */
@Entity('hr_employee_skills')
@Index(['tenantId', 'employeeId', 'skillId'], { unique: true })
export class EmployeeSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ type: 'int', default: 1 })
  proficiency: number;

  @Column({ name: 'assessed_by', type: 'uuid', nullable: true })
  assessedBy: string | null;

  @Column({ name: 'assessed_at', type: 'date', nullable: true })
  assessedAt: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
