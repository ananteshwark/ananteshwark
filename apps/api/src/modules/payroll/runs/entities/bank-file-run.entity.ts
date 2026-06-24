import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BankFileFormat {
  NEFT_RTGS  = 'NEFT_RTGS',
  NACHA_ACH  = 'NACHA_ACH',
  WPS_SIF    = 'WPS_SIF',
  SEPA_XML   = 'SEPA_XML',
}

export enum BankFileStatus {
  GENERATED  = 'GENERATED',
  SUPERSEDED = 'SUPERSEDED',
}

@Entity('pay_bank_file_runs')
@Index(['tenantId', 'payrollRunId'])
export class BankFileRun {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'payroll_run_id', type: 'uuid' }) payrollRunId: string;
  @Column({ type: 'enum', enum: BankFileFormat }) format: BankFileFormat;
  @Column({ type: 'enum', enum: BankFileStatus, default: BankFileStatus.GENERATED }) status: BankFileStatus;
  @Column({ name: 'employee_count', type: 'int', default: 0 }) employeeCount: number;
  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalAmount: number;
  @Column({ type: 'text' }) content: string;
  @Column({ name: 'generated_by', type: 'uuid', nullable: true }) generatedBy: string | null;
  @CreateDateColumn() generatedAt: Date;
}
