import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ProjectExpenseStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('prj_expenses')
export class ProjectExpense {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'project_id', type: 'uuid' }) projectId: string;
  @Column({ length: 300 }) description: string;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'date' }) date: string;
  @Column({ name: 'expense_account_code', type: 'varchar', nullable: true }) expenseAccountCode: string | null;
  @Column({ name: 'attachment_url', type: 'varchar', nullable: true }) attachmentUrl: string | null;
  @Column({ type: 'enum', enum: ProjectExpenseStatus, default: ProjectExpenseStatus.PENDING }) status: ProjectExpenseStatus;
  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true }) approvedById: string | null;
  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true }) journalEntryId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
