import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AccountingPrinciple {
  IFRS = 'IFRS',
  US_GAAP = 'US_GAAP',
  LOCAL_GAAP = 'LOCAL_GAAP',
  TAX = 'TAX',
}

/**
 * A ledger represents one accounting view (leading or parallel). Journal
 * entries carry a `ledgerCode` that ties postings to a specific ledger so the
 * same economic events can be reported under multiple accounting principles.
 */
@Entity('fin_ledgers')
@Index(['tenantId', 'code'], { unique: true })
export class Ledger {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 20 }) code: string;
  @Column({ length: 150 }) name: string;
  @Column({ name: 'accounting_principle', type: 'enum', enum: AccountingPrinciple, default: AccountingPrinciple.LOCAL_GAAP }) accountingPrinciple: AccountingPrinciple;
  @Column({ length: 10, default: 'USD' }) currency: string;
  @Column({ name: 'is_leading', type: 'boolean', default: false }) isLeading: boolean;
  @Column({ name: 'is_active', type: 'boolean', default: true }) isActive: boolean;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
