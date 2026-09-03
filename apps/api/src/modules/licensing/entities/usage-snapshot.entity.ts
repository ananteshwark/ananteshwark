import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('lic_usage_snapshots')
@Index(['tenantId', 'snapshotMonth'], { unique: true })
export class UsageSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'snapshot_month', length: 7 })
  snapshotMonth: string;

  @Column({ name: 'active_employees', type: 'int' })
  activeEmployees: number;

  @Column({ name: 'module_usage', type: 'jsonb', default: [] })
  moduleUsage: Array<{ moduleKey: string; employeeCount: number; unitsConsumed: number }>;

  @Column({
    name: 'total_units',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  totalUnits: number;

  @Column({
    name: 'total_cost',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalCost: number;

  @Column({
    name: 'remaining_units',
    type: 'numeric',
    precision: 18,
    scale: 0,
    transformer: decimalTransformer,
    nullable: true,
  })
  remainingUnits: number | null;
}
