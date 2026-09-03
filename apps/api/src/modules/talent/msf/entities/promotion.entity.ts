import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PromotionStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED',
}

/**
 * A promotion case for one employee. Criteria carry a weight and a score; the
 * readiness score is a weighted, normalised roll-up (the "custom formula"),
 * and the achievement matrix maps the case onto a recommendation band.
 */
@Entity('tal_promotion_cases')
@Index(['tenantId', 'status'])
export class PromotionCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200 }) employeeName: string;
  @Column({ name: 'from_level', length: 40, nullable: true }) fromLevel: string | null;
  @Column({ name: 'to_level', length: 40, nullable: true }) toLevel: string | null;
  @Column({ type: 'enum', enum: PromotionStatus, default: PromotionStatus.DRAFT }) status: PromotionStatus;
  // Weighted criteria, e.g. [{ key:'performance', label:'Sustained performance', weight:3, score:4, maxScore:5 }].
  @Column({ type: 'jsonb', default: () => "'[]'" })
  criteria: Array<{ key: string; label: string; weight: number; score: number; maxScore: number }>;
  // Computed 0–100 readiness score from the weighted criteria.
  @Column({ name: 'readiness_score', type: 'numeric', precision: 6, scale: 2, nullable: true, transformer: decimalTransformer })
  readinessScore: number | null;
  @Column({ name: 'recommendation', length: 60, nullable: true }) recommendation: string | null;
  @Column({ name: 'panel_notes', type: 'text', nullable: true }) panelNotes: string | null;
  @Column({ name: 'decided_by_user_id', nullable: true }) decidedByUserId: string | null;
  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true }) decidedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A configurable N×N achievement / calibration matrix. Rows and columns are
 * named bands; each cell carries a recommendation. Generalises the 9-box to any
 * dimensionality the customer needs.
 */
@Entity('tal_promotion_matrices')
@Index(['tenantId'])
export class AchievementMatrix {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'row_axis', length: 80, default: 'Potential' }) rowAxis: string;
  @Column({ name: 'col_axis', length: 80, default: 'Performance' }) colAxis: string;
  // Ordered band labels for each axis (low → high).
  @Column({ name: 'row_bands', type: 'jsonb', default: () => "'[]'" }) rowBands: string[];
  @Column({ name: 'col_bands', type: 'jsonb', default: () => "'[]'" }) colBands: string[];
  // Cell recommendations keyed "rowBand|colBand".
  @Column({ type: 'jsonb', default: () => "'{}'" }) cells: Record<string, { recommendation: string; note?: string }>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
