import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum EncumbranceType {
  COMMITMENT = 'COMMITMENT', // requisition / PO reserved funds
  OBLIGATION = 'OBLIGATION', // GRN received but not invoiced
  EXPENDITURE = 'EXPENDITURE', // invoiced actual spend
}

export enum EncumbranceStatus {
  OUTSTANDING = 'OUTSTANDING',
  LIQUIDATED = 'LIQUIDATED', // fully consumed by the next stage
}

/**
 * Ph-125 — Encumbrance ledger entry.
 * Oracle Budgetary Control lifecycle: COMMITMENT (PO) → OBLIGATION (GRN) →
 * EXPENDITURE (invoice). Each liquidation reclassifies funds to the next stage
 * so available budget = appropriation − outstanding commitments − outstanding
 * obligations − expenditures.
 */
@Entity('fin_encumbrances')
@Index(['tenantId', 'glAccountId', 'fiscalYear'])
@Index(['tenantId', 'sourceType', 'sourceId'])
@Index(['tenantId', 'type', 'status'])
export class Encumbrance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'enum', enum: EncumbranceType })
  type: EncumbranceType;

  @Column({ type: 'enum', enum: EncumbranceStatus, default: EncumbranceStatus.OUTSTANDING })
  status: EncumbranceStatus;

  @Column({ name: 'source_type', length: 30 })
  sourceType: string; // REQUISITION / PO / GRN / INVOICE

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId: string;

  @Column({ name: 'source_line_id', type: 'uuid', nullable: true })
  sourceLineId: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null; // commitment that spawned this obligation, etc.

  @Column({ name: 'gl_account_id', type: 'uuid' })
  glAccountId: string;

  @Column({ name: 'cost_center_id', type: 'uuid', nullable: true })
  costCenterId: string | null;

  @Column({ name: 'fiscal_year', type: 'int' })
  fiscalYear: number;

  @Column({ type: 'varchar', length: 7, nullable: true })
  period: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  amount: number;

  @Column({ name: 'liquidated_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  liquidatedAmount: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
