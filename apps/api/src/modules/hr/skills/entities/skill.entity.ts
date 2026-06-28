import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-187 — Catalog skill on a 1–5 proficiency scale, shared across the
 * tenant. Employee profiles and job requirements both reference these.
 */
@Entity('hr_skills')
@Index(['tenantId', 'name'], { unique: true })
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'max_proficiency', type: 'int', default: 5 })
  maxProficiency: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
