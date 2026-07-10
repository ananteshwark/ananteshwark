import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum MeritCycleType {
  MERIT = 'MERIT',                 // end-to-end annual merit
  ADHOC = 'ADHOC',                 // off-cycle salary review
  INTERIM = 'INTERIM',             // interim / anniversary review
  PROMOTION = 'PROMOTION',         // promotion & progression
  ANNUAL_BONUS = 'ANNUAL_BONUS',   // annual bonus / variable pay
  LTI = 'LTI',                     // long-term incentives
}

export enum MeritPlanStatus {
  DRAFT = 'DRAFT',             // being configured
  HRBP_REVIEW = 'HRBP_REVIEW', // out to HRBPs to validate before launch
  LAUNCHED = 'LAUNCHED',       // managers proposing on worksheets
  APPROVED = 'APPROVED',       // business approvals complete, outputs generated
  CANCELLED = 'CANCELLED',
}

/**
 * A compensation planning cycle. Config lives here (geographies/currencies,
 * increment ranges, approval depth); budgets, worksheet lines, and outputs
 * hang off it. The status machine gates HRBP validation before launch and
 * output generation on approval.
 */
@Entity('cmp_merit_plans')
@Index(['tenantId', 'status'])
export class MeritPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'cycle_type', type: 'enum', enum: MeritCycleType, default: MeritCycleType.MERIT })
  cycleType: MeritCycleType;
  @Column({ name: 'effective_date', type: 'date' }) effectiveDate: string;
  // Eligible geographies + their currencies, e.g. [{ country:'IN', currency:'INR' }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) geographies: Array<{ country: string; currency: string }>;
  // Increment range bands by performance rating, e.g.
  // [{ rating:'EXCEEDS', minPct:8, maxPct:15, targetPct:12 }].
  @Column({ name: 'increment_ranges', type: 'jsonb', default: () => "'[]'" })
  incrementRanges: Array<{ rating: string; minPct: number; maxPct: number; targetPct: number }>;
  // Number of business approver levels (plus BU/BUHR/CHRO handled separately).
  @Column({ name: 'approver_levels', type: 'int', default: 1 }) approverLevels: number;
  @Column({ name: 'requires_bu_approval', default: false }) requiresBuApproval: boolean;
  @Column({ name: 'requires_chro_approval', default: false }) requiresChroApproval: boolean;
  // Pay-range breach guardrail: max compa-ratio allowed post-increment.
  @Column({ name: 'max_compa_ratio', type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: decimalTransformer })
  maxCompaRatio: number | null;
  @Column({ type: 'enum', enum: MeritPlanStatus, default: MeritPlanStatus.DRAFT }) status: MeritPlanStatus;
  @Column({ name: 'launched_at', type: 'timestamptz', nullable: true }) launchedAt: Date | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'created_by_user_id' }) createdByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
