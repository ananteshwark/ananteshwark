import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('prj_projects')
@Index(['tenantId', 'code'], { unique: true })
export class Project {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'client_name', type: 'varchar', nullable: true }) clientName: string | null;
  @Column({ name: 'manager_id', type: 'varchar' }) managerId: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date', nullable: true }) endDate: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) budget: number | null;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.PLANNING }) status: ProjectStatus;
  @Column({ name: 'completion_percent', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) completionPercent: number;
  @Column({ name: 'revenue_account_code', type: 'varchar', nullable: true }) revenueAccountCode: string | null;
  @Column({ name: 'expense_account_code', type: 'varchar', nullable: true }) expenseAccountCode: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
