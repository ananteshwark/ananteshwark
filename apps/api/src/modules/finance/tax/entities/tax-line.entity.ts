import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum TaxDocumentType {
  BILL = 'BILL',
  INVOICE = 'INVOICE',
}

@Entity('tax_lines')
@Index(['tenantId', 'documentType', 'documentId'])
export class TaxLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({
    name: 'document_type',
    type: 'enum',
    enum: TaxDocumentType,
  })
  documentType: TaxDocumentType;

  @Column({ name: 'document_id' })
  documentId: string;

  @Column({ name: 'tax_code_id' })
  taxCodeId: string;

  @Column({ name: 'tax_code_code', length: 50 })
  taxCodeCode: string;

  @Column({ name: 'tax_code_name', length: 200 })
  taxCodeName: string;

  @Column({ name: 'component_name', length: 100 })
  componentName: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  rate: number;

  @Column({ name: 'base_amount', type: 'numeric', precision: 18, scale: 2 })
  baseAmount: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 18, scale: 2 })
  taxAmount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
