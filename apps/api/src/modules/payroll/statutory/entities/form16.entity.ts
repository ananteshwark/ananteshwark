import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('pay_form16')
@Index(['employeeId', 'tenantId'])
export class Form16 {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @Column({ name: 'financial_year', length: 20 })
  financialYear: string;

  @Column({ name: 'gross_salary', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  grossSalary: number;

  @Column({ name: 'total_deductions', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalDeductions: number;

  @Column({ name: 'taxable_income', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  taxableIncome: number;

  @Column({ name: 'tax_paid', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  taxPaid: number;

  @Column({ name: 'generated_at', type: 'timestamp', nullable: true })
  generatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
