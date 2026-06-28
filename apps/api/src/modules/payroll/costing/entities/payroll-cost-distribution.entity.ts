import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-175 — A single distributed payroll cost line:
 * employee × element × cost-center/project split.
 */
@Entity('pay_cost_distributions')
@Index(['tenantId', 'payrollRunId'])
@Index(['tenantId', 'costCenterId'])
export class PayrollCostDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'payroll_run_id', type: 'uuid' })
  payrollRunId: string;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true })
  employeeId: string | null;

  @Column({ name: 'component_code', length: 50 })
  componentCode: string;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true })
  glAccountId: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @CreateDateColumn() createdAt: Date;
}
