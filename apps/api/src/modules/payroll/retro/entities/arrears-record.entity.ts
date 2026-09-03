import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ArrearsStatus {
  PENDING = 'PENDING',
  APPLIED = 'APPLIED',
  CANCELLED = 'CANCELLED',
}

@Entity('pay_arrears_records')
@Index(['employeeId', 'tenantId'])
@Index(['runId', 'tenantId'])
export class ArrearsRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  // Period in 'YYYY-MM' form
  @Column({ name: 'from_period', length: 7 })
  fromPeriod: string;

  @Column({ name: 'to_period', length: 7 })
  toPeriod: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ name: 'run_id', type: 'uuid', nullable: true })
  runId: string | null;

  @Column({ type: 'enum', enum: ArrearsStatus, default: ArrearsStatus.PENDING })
  status: ArrearsStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
