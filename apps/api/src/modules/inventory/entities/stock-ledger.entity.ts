import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TransactionType {
  OPENING = 'OPENING',
  RECEIPT = 'RECEIPT',
  ISSUE = 'ISSUE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  RETURN = 'RETURN',
  // Phase 73 — Special Procurement
  SUBCONTRACT_OUT = 'SUBCONTRACT_OUT',
  SUBCONTRACT_IN = 'SUBCONTRACT_IN',
  CONSIGNMENT_CONSUME = 'CONSIGNMENT_CONSUME',
  CONSIGNMENT_RETURN = 'CONSIGNMENT_RETURN',
  STO_OUT = 'STO_OUT',
  STO_IN = 'STO_IN',
}

@Entity('inv_stock_ledger')
@Index(['tenantId', 'itemId', 'warehouseId'])
export class StockLedger {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid' }) itemId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ name: 'transaction_type', type: 'enum', enum: TransactionType }) transactionType: TransactionType;
  @Column({ name: 'reference_type', type: 'varchar', nullable: true }) referenceType: string | null;
  @Column({ name: 'reference_id', type: 'varchar', nullable: true }) referenceId: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) quantity: number;
  @Column({ name: 'unit_cost', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) unitCost: number;
  @Column({ name: 'total_cost', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) totalCost: number;
  @Column({ name: 'balance_qty', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) balanceQty: number;
  @Column({ name: 'balance_cost', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) balanceCost: number;
  @Column({ name: 'transaction_date', type: 'date' }) transactionDate: string;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ name: 'unit_cost_mv', type: 'numeric', precision: 18, scale: 6, nullable: true, transformer: decimalTransformer }) unitCostMv: number | null;
  @Column({ name: 'transaction_value', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) transactionValue: number | null;
  @CreateDateColumn() createdAt: Date;
}
