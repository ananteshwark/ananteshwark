import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('exp_policies')
export class ExpensePolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'category_limits', type: 'jsonb', default: [] }) categoryLimits: any[];
  @Column({ name: 'requires_approval_above', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) requiresApprovalAbove: number | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
