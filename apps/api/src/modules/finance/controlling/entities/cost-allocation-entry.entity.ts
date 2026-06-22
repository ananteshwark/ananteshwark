import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_cost_allocation_entries')
@Index(['tenantId', 'cycleId', 'period'])
export class CostAllocationEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ length: 7 })
  period: string;

  @Column({ name: 'from_cost_center_id', type: 'uuid' })
  fromCostCenterId: string;

  @Column({ name: 'to_cost_center_id', type: 'uuid' })
  toCostCenterId: string;

  @Column({ name: 'gl_account_id', type: 'uuid' })
  glAccountId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    transformer: decimalTransformer,
  })
  amount: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
