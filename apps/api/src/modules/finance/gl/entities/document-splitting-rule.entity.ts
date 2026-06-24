import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum SplitDimension {
  PROFIT_CENTER = 'PROFIT_CENTER',
  COST_CENTER = 'COST_CENTER',
}

export enum SplitAccountType {
  ALL = 'ALL',
  BALANCE_SHEET = 'BALANCE_SHEET',
  CASH_BANK = 'CASH_BANK',
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

@Entity('fin_document_splitting_rules')
export class DocumentSplittingRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) name: string;
  @Column({ name: 'split_dimension', type: 'enum', enum: SplitDimension, default: SplitDimension.PROFIT_CENTER }) splitDimension: SplitDimension;
  @Column({ name: 'trigger_account_type', type: 'enum', enum: SplitAccountType, default: SplitAccountType.BALANCE_SHEET }) triggerAccountType: SplitAccountType;
  @Column({ name: 'clearing_account_id', type: 'uuid', nullable: true }) clearingAccountId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
