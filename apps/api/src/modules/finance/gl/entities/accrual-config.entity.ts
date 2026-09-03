import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum AccrualConfigStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('fin_accrual_configs')
@Index(['tenantId'])
export class AccrualConfig {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;

  @Column({ name: 'accrual_account_id', type: 'uuid' }) accrualAccountId: string;
  @Column({ name: 'offset_account_id', type: 'uuid' }) offsetAccountId: string;

  @Column({ name: 'monthly_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) monthlyAmount: number;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true }) costCenterId: string | null;
  @Column({ name: 'profit_center_id', type: 'uuid', nullable: true }) profitCenterId: string | null;

  @Column({ name: 'auto_reverse', default: true }) autoReverse: boolean;
  @Column({ name: 'last_posted_period', nullable: true }) lastPostedPeriod: string | null;

  @Column({ type: 'enum', enum: AccrualConfigStatus, default: AccrualConfigStatus.ACTIVE }) status: AccrualConfigStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
