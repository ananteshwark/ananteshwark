import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum SweepType {
  ZERO_BALANCE = 'ZERO_BALANCE',
  TARGET_BALANCE = 'TARGET_BALANCE',
}

@Entity('fin_sweep_rules')
@Index(['tenantId'])
export class SweepRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'sweep_type', type: 'enum', enum: SweepType }) sweepType: SweepType;
  @Column({ name: 'source_account_id', type: 'uuid' }) sourceAccountId: string;
  @Column({ name: 'target_account_id', type: 'uuid' }) targetAccountId: string;
  @Column({ name: 'target_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) targetBalance: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true }) lastRunAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
