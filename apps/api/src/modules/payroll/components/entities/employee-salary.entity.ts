import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export interface ResolvedComponent {
  code: string;
  name: string;
  type: string;
  amount: number;
  isStatutory?: boolean;
  statutoryType?: string | null;
  glAccountCode?: string | null;
}

@Entity('pay_employee_salaries')
@Index(['employeeId', 'tenantId'])
export class EmployeeSalary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'structure_id', type: 'uuid', nullable: true })
  structureId: string | null;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  ctc: number;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo: string | null;

  @Column({ type: 'jsonb', nullable: true })
  components: ResolvedComponent[] | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
