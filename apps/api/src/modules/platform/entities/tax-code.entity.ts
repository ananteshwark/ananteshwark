import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TaxType {
  GST  = 'GST',
  VAT  = 'VAT',
  IGST = 'IGST',
  SGST = 'SGST',
  CGST = 'CGST',
  TDS  = 'TDS',
  OTHER = 'OTHER',
}

@Entity('plt_tax_codes')
@Index(['tenantId', 'code'], { unique: true })
export class TaxCode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: TaxType }) type: TaxType;
  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: decimalTransformer }) rate: number;
  @Column({ name: 'gl_account_code', nullable: true }) glAccountCode: string | null;
  @Column({ name: 'effective_from', type: 'date' }) effectiveFrom: string;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, any> | null;
  @CreateDateColumn() createdAt: Date;
}
