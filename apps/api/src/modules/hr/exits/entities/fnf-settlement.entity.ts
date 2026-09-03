import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum FnfStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

@Entity('hr_fnf_settlements')
@Index(['exitRequestId', 'tenantId'])
export class FnfSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'exit_request_id', type: 'uuid' })
  exitRequestId: string;

  @Column({ name: 'pending_salary', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  pendingSalary: number;

  @Column({ name: 'leave_encashment', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  leaveEncashment: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  gratuity: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  deductions: number;

  @Column({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  netAmount: number;

  @Column({ type: 'enum', enum: FnfStatus, default: FnfStatus.DRAFT })
  status: FnfStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
