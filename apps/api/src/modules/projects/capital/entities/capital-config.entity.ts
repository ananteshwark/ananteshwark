import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum CostTreatment {
  CAPITALIZE = 'CAPITALIZE',
  EXPENSE = 'EXPENSE',
}

/**
 * Ph-248 — Capital-project configuration: whether a project capitalizes costs,
 * its CIP account, and the default treatment for tasks without a rule.
 */
@Entity('pjt_capital_configs')
@Index(['tenantId', 'projectId'], { unique: true })
export class CapitalProjectConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'is_capital', default: false })
  isCapital: boolean;

  @Column({ name: 'cip_account_code', length: 40, nullable: true })
  cipAccountCode: string | null;

  @Column({ name: 'default_treatment', type: 'enum', enum: CostTreatment, default: CostTreatment.EXPENSE })
  defaultTreatment: CostTreatment;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
