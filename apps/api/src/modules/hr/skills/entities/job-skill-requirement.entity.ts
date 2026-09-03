import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-189 — Required proficiency (1–5) in a skill for a job/role. Gap
 * analysis compares an employee's profile against these requirements.
 */
@Entity('hr_job_skill_requirements')
@Index(['tenantId', 'jobId', 'skillId'], { unique: true })
export class JobSkillRequirement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'job_id', type: 'varchar' })
  jobId: string;

  @Column({ name: 'skill_id', type: 'uuid' })
  skillId: string;

  @Column({ name: 'required_proficiency', type: 'int', default: 1 })
  requiredProficiency: number;

  @Column({ name: 'is_mandatory', default: true })
  isMandatory: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
