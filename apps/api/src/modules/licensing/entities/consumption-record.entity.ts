import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ConsumptionType {
  EMPLOYEE = 'EMPLOYEE',
  MODULE = 'MODULE',
  OVERAGE = 'OVERAGE',
}

@Entity('lic_consumption_records')
@Index(['tenantId', 'periodMonth'])
export class ConsumptionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'period_month', length: 7 })
  periodMonth: string;

  @Column({ name: 'record_date', type: 'date' })
  recordDate: string;

  @Column({
    name: 'consumption_type',
    type: 'enum',
    enum: ConsumptionType,
  })
  consumptionType: ConsumptionType;

  @Column({ name: 'module_key', nullable: true })
  moduleKey: string | null;

  @Column({ name: 'active_employees', type: 'int' })
  activeEmployees: number;

  @Column({
    name: 'units_consumed',
    type: 'numeric',
    precision: 18,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitsConsumed: number;

  @Column({
    name: 'unit_rate',
    type: 'numeric',
    precision: 12,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitRate: number;

  @Column({
    name: 'total_cost',
    type: 'numeric',
    precision: 15,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalCost: number;

  @Column({ nullable: true, type: 'text' })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
