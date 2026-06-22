import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum BankImportStatus {
  IMPORTED = 'IMPORTED',
  RECONCILED = 'RECONCILED',
}

@Entity('fin_bank_statement_imports')
@Index(['tenantId', 'bankAccountId'])
export class BankStatementImport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'bank_account_id', type: 'uuid' })
  bankAccountId: string;

  @Column({ name: 'file_name', length: 255 })
  fileName: string;

  @Column({ name: 'import_date', type: 'timestamp' })
  importDate: Date;

  @Column({ name: 'from_date', type: 'date', nullable: true })
  fromDate: string | null;

  @Column({ name: 'to_date', type: 'date', nullable: true })
  toDate: string | null;

  @Column({ name: 'transaction_count', type: 'int', default: 0 })
  transactionCount: number;

  @Column({ name: 'matched_count', type: 'int', default: 0 })
  matchedCount: number;

  @Column({ length: 20, default: BankImportStatus.IMPORTED })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
