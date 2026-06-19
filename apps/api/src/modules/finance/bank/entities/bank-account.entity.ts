import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BankAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('fin_bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'account_number', length: 100, nullable: true })
  accountNumber: string;

  @Column({ name: 'bank_name', length: 200, nullable: true })
  bankName: string;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'gl_account_id', type: 'uuid' })
  glAccountId: string;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  openingBalance: number;

  @Column({ name: 'current_balance', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  currentBalance: number;

  @Column({ type: 'enum', enum: BankAccountStatus, default: BankAccountStatus.ACTIVE })
  status: BankAccountStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
