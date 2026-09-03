import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AppraisalResultStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
}

@Entity('tal_appraisal_results')
export class AppraisalResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'review_cycle_id', type: 'uuid' })
  reviewCycleId: string;

  @Column({ name: 'employee_id', type: 'varchar' })
  employeeId: string;

  @Column({ name: 'final_rating', type: 'decimal', precision: 3, scale: 2 })
  finalRating: number;

  @Column({ name: 'rating_label', length: 100 })
  ratingLabel: string;

  @Column({ name: 'increment_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  incrementPercent: number | null;

  @Column({ name: 'bonus_amount', type: 'decimal', precision: 18, scale: 2, nullable: true })
  bonusAmount: number | null;

  @Column({ name: 'promotion_recommended', default: false })
  promotionRecommended: boolean;

  @Column({ name: 'updated_designation_id', type: 'uuid', nullable: true })
  updatedDesignationId: string | null;

  @Column({ name: 'effective_date', type: 'date', nullable: true })
  effectiveDate: string | null;

  @Column({ type: 'enum', enum: AppraisalResultStatus, default: AppraisalResultStatus.DRAFT })
  status: AppraisalResultStatus;

  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true })
  approvedById: string | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
