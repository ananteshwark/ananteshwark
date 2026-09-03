import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('proc_delegation_authority')
@Index(['tenantId', 'documentType', 'level', 'isActive'])
export class DelegationAuthority {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'document_type', length: 20 })
  documentType: string;

  @Column({ type: 'int' })
  level: number;

  @Column({
    name: 'amount_from',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  amountFrom: number;

  @Column({
    name: 'amount_to',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  amountTo: number | null;

  @Column({ name: 'approver_user_id', type: 'uuid', nullable: true })
  approverUserId: string | null;

  @Column({ name: 'approver_role', length: 100 })
  approverRole: string;

  @Column({ name: 'approver_name', length: 200 })
  approverName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
