import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum TalentReviewStatus {
  DRAFT = 'DRAFT',                   // building the roster
  IN_CALIBRATION = 'IN_CALIBRATION', // panel adjusting placements
  FINALIZED = 'FINALIZED',
}

/**
 * A talent-review (calibration) session for an org unit: managers place their
 * people on the 9-box, the panel calibrates, and on finalisation the top-box
 * talent flows into the HiPo pool.
 */
@Entity('tal_talent_reviews')
@Index(['tenantId', 'status'])
export class TalentReview {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'org_unit_id', type: 'uuid', nullable: true }) orgUnitId: string | null;
  @Column({ name: 'cycle', length: 40, nullable: true }) cycle: string | null;
  @Column({ name: 'facilitator_user_id', nullable: true }) facilitatorUserId: string | null;
  @Column({ type: 'enum', enum: TalentReviewStatus, default: TalentReviewStatus.DRAFT }) status: TalentReviewStatus;
  // Pool that top-right (star) placements feed on finalisation.
  @Column({ name: 'hipo_pool_id', type: 'uuid', nullable: true }) hipoPoolId: string | null;
  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true }) finalizedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum Rating3 {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/**
 * One employee's placement on the 9-box grid (performance × potential). The box
 * (1–9) and its label are derived from the two ratings.
 */
@Entity('tal_ninebox_placements')
@Index(['tenantId', 'reviewId'])
export class NineBoxPlacement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'review_id', type: 'uuid' }) reviewId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ type: 'enum', enum: Rating3, default: Rating3.MEDIUM }) performance: Rating3;
  @Column({ type: 'enum', enum: Rating3, default: Rating3.MEDIUM }) potential: Rating3;
  // Derived: 1..9 (9 = high perf & high potential), plus a human label.
  @Column({ type: 'int', default: 5 }) box: number;
  @Column({ name: 'box_label', length: 40, default: 'Core Player' }) boxLabel: string;
  // Retention signals often captured in the same session.
  @Column({ name: 'flight_risk', length: 10, nullable: true }) flightRisk: string | null; // LOW|MEDIUM|HIGH
  @Column({ name: 'impact_of_loss', length: 10, nullable: true }) impactOfLoss: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
