import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum Proficiency {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  EXPERT = 'EXPERT',
}

@Entity('tal_skill_matrix')
@Index(['tenantId', 'employeeId', 'skill'], { unique: true })
export class SkillMatrix {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ length: 100 })
  skill: string;

  @Column({ type: 'enum', enum: Proficiency, default: Proficiency.BEGINNER })
  proficiency: Proficiency;

  @Column({ name: 'endorsed_by', type: 'varchar', nullable: true })
  endorsedBy: string | null;

  @Column({ name: 'assessed_at', type: 'date' })
  assessedAt: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
