import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum PayComponentType {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
  EMPLOYER_CONTRIBUTION = 'EMPLOYER_CONTRIBUTION',
  REIMBURSEMENT = 'REIMBURSEMENT',
}

export enum CalculationType {
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
  FORMULA = 'FORMULA',
  SLAB = 'SLAB',
}

export enum StatutoryType {
  PF = 'PF',
  ESI = 'ESI',
  PT = 'PT',
  TDS = 'TDS',
  GRATUITY = 'GRATUITY',
}

@Entity('pay_components')
@Index(['code', 'tenantId'], { unique: true })
export class PayComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: PayComponentType })
  type: PayComponentType;

  @Column({ name: 'calculation_type', type: 'enum', enum: CalculationType, default: CalculationType.FIXED })
  calculationType: CalculationType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  value: number | null;

  @Column({ name: 'percentage_of', length: 50, nullable: true })
  percentageOf: string | null;

  @Column({ type: 'text', nullable: true })
  formula: string | null;

  @Column({ name: 'is_taxable', default: true })
  isTaxable: boolean;

  @Column({ name: 'is_statutory', default: false })
  isStatutory: boolean;

  @Column({ name: 'statutory_type', type: 'enum', enum: StatutoryType, nullable: true })
  statutoryType: StatutoryType | null;

  @Column({ name: 'gl_account_code', length: 50, nullable: true })
  glAccountCode: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
