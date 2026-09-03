import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum BenefitPlanType {
  HEALTH        = 'HEALTH',
  DENTAL        = 'DENTAL',
  VISION        = 'VISION',
  LIFE          = 'LIFE',
  RETIREMENT    = 'RETIREMENT',
  DISABILITY    = 'DISABILITY',
  OTHER         = 'OTHER',
}

export enum BenefitPlanStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('ben_plans')
@Index(['tenantId', 'code'], { unique: true })
export class BenefitPlan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: BenefitPlanType }) type: BenefitPlanType;
  @Column({ type: 'enum', enum: BenefitPlanStatus, default: BenefitPlanStatus.ACTIVE }) status: BenefitPlanStatus;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'employer_contribution', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) employerContribution: number;
  @Column({ name: 'employee_contribution', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) employeeContribution: number;
  @Column({ name: 'contribution_type', default: 'FIXED' }) contributionType: 'FIXED' | 'PERCENTAGE';
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @CreateDateColumn() createdAt: Date;
}
