import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AllocationCycleType {
  ASSESSMENT = 'ASSESSMENT',
  DISTRIBUTION = 'DISTRIBUTION',
}

export enum AllocationCycleStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

export interface AllocationRule {
  senderId: string;
  senderType: 'COST_CENTER' | 'GL_ACCOUNT';
  receiverIds: string[];
  method: 'PERCENTAGE' | 'FIXED' | 'SKF';
  /** For PERCENTAGE: values summing to 100. For FIXED: absolute amounts. */
  split: number[];
}

@Entity('fin_cost_allocation_cycles')
@Index(['tenantId', 'code'], { unique: true })
export class CostAllocationCycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: AllocationCycleType })
  type: AllocationCycleType;

  @Column({ name: 'from_period', length: 7 })
  fromPeriod: string;

  @Column({ name: 'to_period', length: 7 })
  toPeriod: string;

  @Column({ type: 'enum', enum: AllocationCycleStatus, default: AllocationCycleStatus.DRAFT })
  status: AllocationCycleStatus;

  @Column({ type: 'jsonb', default: [] })
  rules: AllocationRule[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
