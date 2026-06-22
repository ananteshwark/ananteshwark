import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum ImportedLineStatus {
  UNMATCHED = 'UNMATCHED',
  MATCHED = 'MATCHED',
}

export enum ImportedLineMatchType {
  VENDOR_PAYMENT = 'VENDOR_PAYMENT',
  CUSTOMER_RECEIPT = 'CUSTOMER_RECEIPT',
}

@Entity('fin_imported_bank_lines')
@Index(['tenantId', 'importId'])
export class ImportedBankLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'import_id', type: 'uuid' })
  importId: string;

  @Column({ name: 'txn_date', type: 'date' })
  txnDate: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 200, nullable: true })
  reference: string | null;

  /** Signed amount: positive = credit, negative = debit */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ name: 'matched_type', length: 30, nullable: true })
  matchedType: string | null;

  @Column({ name: 'matched_id', type: 'uuid', nullable: true })
  matchedId: string | null;

  @Column({ length: 20, default: ImportedLineStatus.UNMATCHED })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
