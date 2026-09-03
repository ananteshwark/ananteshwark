import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TaxType {
  GST_IGST = 'GST_IGST',
  GST_CGST_SGST = 'GST_CGST_SGST',
  VAT = 'VAT',
  WITHHOLDING = 'WITHHOLDING',
  NONE = 'NONE',
}

export interface TaxComponent {
  name: string;
  rate: number;
  glAccountId?: string;
}

@Entity('tax_codes')
@Index(['tenantId', 'code'], { unique: true })
export class TaxCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({
    type: 'enum',
    enum: TaxType,
    default: TaxType.NONE,
  })
  type: TaxType;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  rate: number;

  @Column({ type: 'jsonb', default: [] })
  components: TaxComponent[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
