import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum TaxRegime {
  OLD = 'OLD',
  NEW = 'NEW',
}

@Entity('pay_tax_slabs')
@Index(['tenantId', 'regime', 'financialYear'])
export class TaxSlab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: TaxRegime, default: TaxRegime.NEW })
  regime: TaxRegime;

  @Column({ name: 'financial_year', length: 20 })
  financialYear: string;

  @Column({ name: 'from_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  fromAmount: number;

  @Column({ name: 'to_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  toAmount: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  rate: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 0, transformer: decimalTransformer })
  surcharge: number;

  @CreateDateColumn()
  createdAt: Date;
}
