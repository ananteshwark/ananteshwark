import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PayslipStatus {
  GENERATED = 'GENERATED',
  PUBLISHED = 'PUBLISHED',
  PAID = 'PAID',
}

export interface PayslipLineItem {
  code: string;
  name: string;
  amount: number;
}

@Entity('pay_payslips')
@Index(['payrollRunId', 'tenantId'])
@Index(['employeeId', 'tenantId'])
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'payroll_run_id', type: 'uuid' })
  payrollRunId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'employee_code', length: 50 })
  employeeCode: string;

  @Column({ name: 'employee_name', length: 200 })
  employeeName: string;

  @Column({ name: 'pay_period_month', type: 'int' })
  payPeriodMonth: number;

  @Column({ name: 'pay_period_year', type: 'int' })
  payPeriodYear: number;

  @Column({ name: 'days_worked', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  daysWorked: number;

  @Column({ name: 'lop_days', type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  lopDays: number;

  @Column({ name: 'gross_earnings', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  grossEarnings: number;

  @Column({ name: 'total_deductions', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalDeductions: number;

  @Column({ name: 'net_pay', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  netPay: number;

  @Column({ name: 'employer_contributions', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  employerContributions: number;

  @Column({ type: 'enum', enum: PayslipStatus, default: PayslipStatus.GENERATED })
  status: PayslipStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  earnings: PayslipLineItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  deductions: PayslipLineItem[];

  @Column({ name: 'employer_contribs', type: 'jsonb', default: () => "'[]'" })
  employerContribs: PayslipLineItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
