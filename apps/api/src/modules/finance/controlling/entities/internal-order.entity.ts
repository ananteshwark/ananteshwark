import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum InternalOrderObjectClass {
  OVERHEAD = 'OVERHEAD',
  INVESTMENT = 'INVESTMENT',
  ACCRUAL = 'ACCRUAL',
}

export enum InternalOrderStatus {
  OPEN = 'OPEN',
  RELEASED = 'RELEASED',
  TECHNICALLY_CLOSED = 'TECHNICALLY_CLOSED',
  CLOSED = 'CLOSED',
}

@Entity('fin_internal_orders')
@Index(['tenantId', 'orderNumber'], { unique: true })
export class InternalOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'order_number', length: 30 }) orderNumber: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ name: 'object_class', type: 'enum', enum: InternalOrderObjectClass, default: InternalOrderObjectClass.OVERHEAD })
  objectClass: InternalOrderObjectClass;

  @Column({ name: 'responsible_cost_center_id', type: 'uuid', nullable: true })
  responsibleCostCenterId: string | null;

  @Column({ name: 'budget', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  budget: number;

  @Column({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  actualCost: number;

  @Column({ name: 'settlement_cost_center_id', type: 'uuid', nullable: true })
  settlementCostCenterId: string | null;

  @Column({ name: 'settlement_account_id', type: 'uuid', nullable: true })
  settlementAccountId: string | null;

  @Column({ type: 'enum', enum: InternalOrderStatus, default: InternalOrderStatus.OPEN })
  status: InternalOrderStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
