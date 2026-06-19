import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CourseType {
  INTERNAL = 'INTERNAL',
  EXTERNAL = 'EXTERNAL',
  ONLINE = 'ONLINE',
}

@Entity('tal_courses')
@Index(['code', 'tenantId'], { unique: true })
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CourseType, default: CourseType.INTERNAL })
  type: CourseType;

  @Column({ name: 'duration_hours', type: 'decimal', precision: 6, scale: 2 })
  durationHours: number;

  @Column({ length: 200, nullable: true })
  provider: string | null;

  @Column({ name: 'skill_tags', type: 'jsonb', default: '[]' })
  skillTags: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
