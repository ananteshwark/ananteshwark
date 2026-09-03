import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('tal_onboarding_plans')
export class OnboardingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'target_completion_date', type: 'date' })
  targetCompletionDate: string;

  @Column({ type: 'enum', enum: OnboardingStatus, default: OnboardingStatus.NOT_STARTED })
  status: OnboardingStatus;

  @Column({ name: 'completion_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  completionPercent: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
