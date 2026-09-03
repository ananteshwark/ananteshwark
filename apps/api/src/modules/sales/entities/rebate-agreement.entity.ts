import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum RebateStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SETTLED = 'SETTLED',
}

export enum RebateCalculationBasis {
  REVENUE = 'REVENUE',
  QUANTITY = 'QUANTITY',
}

@Entity('sd_rebate_agreements')
@Index(['tenantId', 'customerId'])
export class RebateAgreement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'agreement_number', length: 30 }) agreementNumber: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId: string;
  @Column({ name: 'customer_name', nullable: true }) customerName: string | null;
  @Column({ length: 100 }) name: string;

  @Column({ name: 'valid_from', type: 'date' }) validFrom: string;
  @Column({ name: 'valid_to', type: 'date' }) validTo: string;

  @Column({ name: 'calculation_basis', type: 'enum', enum: RebateCalculationBasis, default: RebateCalculationBasis.REVENUE })
  calculationBasis: RebateCalculationBasis;

  @Column({ type: 'jsonb', default: [] }) tiers: Array<{
    from: number;
    to: number | null;
    rebatePct: number;
  }>;

  @Column({ name: 'accrued_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  accruedAmount: number;

  @Column({ name: 'settled_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  settledAmount: number;

  @Column({ type: 'enum', enum: RebateStatus, default: RebateStatus.ACTIVE }) status: RebateStatus;

  @Column({ name: 'credit_note_account_id', type: 'uuid', nullable: true }) creditNoteAccountId: string | null;

  @Column({ type: 'text', nullable: true }) notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
