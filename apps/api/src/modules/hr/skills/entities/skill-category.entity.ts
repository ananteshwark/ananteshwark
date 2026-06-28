import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-187 — Skills taxonomy category (e.g. "Engineering", "Leadership").
 * Groups catalog skills for browsing and gap rollups.
 */
@Entity('hr_skill_categories')
@Index(['tenantId', 'name'], { unique: true })
export class SkillCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
