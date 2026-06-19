import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum TdsReturnQuarter {
  Q1 = 'Q1',
  Q2 = 'Q2',
  Q3 = 'Q3',
  Q4 = 'Q4',
}

export enum TdsReturnStatus {
  DRAFT = 'DRAFT',
  FILED = 'FILED',
}

@Entity('pay_tds_returns')
export class TdsReturn {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'financial_year', length: 20 }) financialYear: string;
  @Column({ type: 'enum', enum: TdsReturnQuarter }) quarter: TdsReturnQuarter;
  @Column({ name: 'total_employees', type: 'int', default: 0 }) totalEmployees: number;
  @Column({ name: 'total_tds_deducted', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalTdsDeducted: number;
  @Column({ name: 'total_tds_deposited', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalTdsDeposited: number;
  @Column({ type: 'enum', enum: TdsReturnStatus, default: TdsReturnStatus.DRAFT }) status: TdsReturnStatus;
  @Column({ name: 'filed_at', type: 'timestamp', nullable: true }) filedAt: Date | null;
  @Column({ name: 'acknowledgement_number', type: 'varchar', nullable: true }) acknowledgementNumber: string | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
