import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum FormType {
  SELF = 'SELF',
  MANAGER = 'MANAGER',
  PEER = 'PEER',
  REVIEW_360 = '360',
}

export enum FormStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
}

@Entity('tal_review_forms')
export class ReviewForm {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'reviewer_id', type: 'varchar' })
  reviewerId: string;

  @Column({ type: 'enum', enum: FormType, default: FormType.SELF })
  type: FormType;

  @Column({ type: 'enum', enum: FormStatus, default: FormStatus.PENDING })
  status: FormStatus;

  @Column({ type: 'jsonb', default: '[]' })
  sections: any[];

  @Column({ type: 'jsonb', default: '{}' })
  responses: Record<string, any>;

  @Column({ name: 'overall_rating', type: 'decimal', precision: 3, scale: 2, nullable: true })
  overallRating: number | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'acknowledged_at', type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
