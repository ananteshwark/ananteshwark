import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export interface ApprovalLevel {
  level: number;
  minAmount: number;
  maxAmount: number | null;
  approverRole: string;
  label: string;
}

@Entity('proc_approval_matrix')
export class ApprovalMatrix {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) name: string;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ type: 'jsonb' }) levels: ApprovalLevel[];
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
