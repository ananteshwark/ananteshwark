import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../../common/transformers/decimal.transformer';

/** Statutory year-end / settlement form types across jurisdictions. */
export enum StatutoryFormType {
  W2 = 'W2',               // US — Wage and Tax Statement (per employee)
  FORM_1099_NEC = 'FORM_1099_NEC', // US — Nonemployee Compensation (per contractor)
  W3 = 'W3',               // US — Transmittal of Wage and Tax Statements (employer summary)
  EFW2 = 'EFW2',           // US — SSA electronic submission (EFW2 fixed-width)
}

export enum StatutoryFormStatus {
  GENERATED = 'GENERATED',
  FILED = 'FILED',
  SUPERSEDED = 'SUPERSEDED',
}

/**
 * A generated statutory form. For per-recipient forms (W-2, 1099-NEC) the
 * `employeeId` / `recipientName` are populated; for employer-level forms
 * (W-3, EFW2) they are null and `data` holds the aggregate figures.
 */
@Entity('pay_statutory_forms')
@Index(['tenantId', 'formType', 'taxYear'])
@Index(['tenantId', 'employeeId'])
export class StatutoryForm {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'form_type', type: 'enum', enum: StatutoryFormType }) formType: StatutoryFormType;
  @Column({ name: 'tax_year', type: 'int' }) taxYear: number;

  @Column({ name: 'employee_id', type: 'uuid', nullable: true }) employeeId: string | null;
  @Column({ name: 'recipient_name', length: 200, nullable: true }) recipientName: string | null;
  @Column({ name: 'recipient_tax_id', length: 40, nullable: true }) recipientTaxId: string | null;

  /** Box-by-box figures (W-2 boxes 1–20, 1099 boxes, W-3 totals). */
  @Column({ type: 'jsonb', default: () => "'{}'" }) data: Record<string, any>;

  /** Rendered machine file content (EFW2 fixed-width); null for individual forms. */
  @Column({ type: 'text', nullable: true }) content: string | null;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) totalAmount: number;
  @Column({ name: 'recipient_count', type: 'int', default: 0 }) recipientCount: number;

  @Column({ type: 'enum', enum: StatutoryFormStatus, default: StatutoryFormStatus.GENERATED }) status: StatutoryFormStatus;
  @Column({ name: 'generated_by', type: 'uuid', nullable: true }) generatedBy: string | null;
  @CreateDateColumn() generatedAt: Date;
}
