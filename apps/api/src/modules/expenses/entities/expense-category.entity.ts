import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('exp_categories')
export class ExpenseCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'gl_account_code', type: 'varchar', nullable: true }) glAccountCode: string | null;
  @Column({ name: 'requires_receipt', default: true }) requiresReceipt: boolean;
  @Column({ name: 'max_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) maxAmount: number | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
