import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SlaEventClass {
  AP_INVOICE = 'AP_INVOICE',
  AP_PAYMENT = 'AP_PAYMENT',
  AR_INVOICE = 'AR_INVOICE',
  AR_RECEIPT = 'AR_RECEIPT',
  BANK_TRANSACTION = 'BANK_TRANSACTION',
  ASSET_DEPRECIATION = 'ASSET_DEPRECIATION',
  ASSET_DISPOSAL = 'ASSET_DISPOSAL',
  LEASE_RECOGNITION = 'LEASE_RECOGNITION',
  LEASE_PAYMENT = 'LEASE_PAYMENT',
  PAYROLL = 'PAYROLL',
  INVENTORY_VALUATION = 'INVENTORY_VALUATION',
  STOCK_MOVEMENT = 'STOCK_MOVEMENT',
}

export enum SlaLineType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

/**
 * Account Derivation Rule — maps a business event + optional condition to a GL account.
 * Evaluated in ascending priority order; first matching active rule wins.
 *
 * conditionExpression examples:
 *   null                                   → always matches (catch-all)
 *   {"field":"currency","op":"neq","value":"USD"}
 *   {"and":[{"field":"amount","op":"gt","value":0},{"field":"taxCode","op":"eq","value":"GST"}]}
 *   {"or":[{"field":"currency","op":"eq","value":"EUR"},{"field":"currency","op":"eq","value":"GBP"}]}
 */
@Entity('fin_sla_rules')
@Index(['tenantId', 'eventClass', 'priority'])
export class SlaRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Column({ name: 'event_class', type: 'enum', enum: SlaEventClass })
  eventClass: SlaEventClass;

  @Column({ name: 'line_type', type: 'enum', enum: SlaLineType })
  lineType: SlaLineType;

  @Column({ type: 'int', default: 50 })
  priority: number;

  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId: string | null;

  @Column({ name: 'condition_expression', type: 'jsonb', nullable: true })
  conditionExpression: any | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
