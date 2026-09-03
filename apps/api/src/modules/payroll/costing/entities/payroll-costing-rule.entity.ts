import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum SplitType {
  PERCENTAGE = 'PERCENTAGE',
  ABSOLUTE = 'ABSOLUTE',
}

/**
 * Ph-174 — Payroll costing rule.
 * Distributes a payroll element's cost to a cost center / project, by percentage
 * or absolute amount. Rules are matched by element (null = all elements) in
 * priority order; the unallocated remainder falls to the default cost center.
 */
@Entity('pay_costing_rules')
@Index(['tenantId', 'componentCode', 'priority'])
export class PayrollCostingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  /** Payroll element/component code; null applies to all elements. */
  @Column({ name: 'component_code', length: 50, nullable: true })
  componentCode: string | null;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true })
  glAccountId: string | null;

  @Column({ name: 'split_type', type: 'enum', enum: SplitType, default: SplitType.PERCENTAGE })
  splitType: SplitType;

  @Column({ name: 'split_value', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  splitValue: number;

  @Column({ type: 'int', default: 50 })
  priority: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
