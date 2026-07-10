import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A named proficiency level on a skill's scale (e.g. level 3 = "Practitioner —
 * works independently"). A skillId of null defines the tenant's default scale.
 */
@Entity('hr_proficiency_descriptors')
@Index(['tenantId', 'skillId', 'level'], { unique: true })
export class ProficiencyDescriptor {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'skill_id', type: 'uuid', nullable: true }) skillId: string | null;
  @Column({ type: 'int' }) level: number;
  @Column({ length: 60 }) label: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
