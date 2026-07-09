import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ExpenseLineType {
  GENERAL = 'GENERAL',
  PER_DIEM = 'PER_DIEM',
  MILEAGE = 'MILEAGE',
}

@Entity('exp_claim_lines')
export class ExpenseLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'claim_id', type: 'uuid' }) claimId: string;
  @Column({ name: 'line_number', type: 'int' }) lineNumber: number;
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null;
  @Column({ length: 300 }) description: string;
  @Column({ name: 'expense_date', type: 'date' }) expenseDate: string;
  @Column({ type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) amount: number;
  @Column({ length: 10 }) currency: string;
  @Column({ name: 'receipt_url', type: 'varchar', nullable: true }) receiptUrl: string | null;
  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) taxAmount: number;
  @Column({ name: 'project_id', type: 'varchar', nullable: true }) projectId: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  // Computed lines: per-diem (quantity = days) and mileage (quantity = km)
  // reference a rate card; amount = rate × quantity.
  @Column({ name: 'line_type', type: 'enum', enum: ExpenseLineType, default: ExpenseLineType.GENERAL })
  lineType: ExpenseLineType;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: decimalTransformer })
  quantity: number | null;
  @Column({ name: 'rate_id', type: 'uuid', nullable: true }) rateId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
