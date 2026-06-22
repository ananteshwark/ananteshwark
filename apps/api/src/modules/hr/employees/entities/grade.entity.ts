import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('hr_grades')
@Index(['tenantId', 'code'], { unique: true })
export class Grade {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'min_salary', type: 'numeric', precision: 18, scale: 2, nullable: true }) minSalary: number | null;
  @Column({ name: 'max_salary', type: 'numeric', precision: 18, scale: 2, nullable: true }) maxSalary: number | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
