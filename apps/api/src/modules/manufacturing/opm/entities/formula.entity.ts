import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum FormulaStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Ph-159 — Process-manufacturing formula / recipe header.
 * Oracle OPM: a formula yields a standard output quantity of a product from a
 * set of ingredient lines, with an overall yield %.
 */
@Entity('opm_formulas')
@Index(['tenantId', 'code'], { unique: true })
export class Formula {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'product_item_id', type: 'uuid' })
  productItemId: string;

  @Column({ name: 'output_quantity', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  outputQuantity: number;

  @Column({ name: 'output_uom', length: 20, default: 'KG' })
  outputUom: string;

  @Column({ name: 'yield_pct', type: 'numeric', precision: 9, scale: 4, default: 100, transformer: decimalTransformer })
  yieldPct: number;

  @Column({ type: 'enum', enum: FormulaStatus, default: FormulaStatus.DRAFT })
  status: FormulaStatus;

  @Column({ length: 20, default: 'v1' })
  version: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum FormulaLineType {
  INGREDIENT = 'INGREDIENT',
  COPRODUCT = 'COPRODUCT',
  BYPRODUCT = 'BYPRODUCT',
}

@Entity('opm_formula_details')
@Index(['tenantId', 'formulaId'])
export class FormulaDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'formula_id', type: 'uuid' })
  formulaId: string;

  @Column({ name: 'line_type', type: 'enum', enum: FormulaLineType, default: FormulaLineType.INGREDIENT })
  lineType: FormulaLineType;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantity: number;

  @Column({ length: 20, default: 'KG' })
  uom: string;

  @Column({ name: 'scrap_pct', type: 'numeric', precision: 9, scale: 4, default: 0, transformer: decimalTransformer })
  scrapPct: number;

  @CreateDateColumn() createdAt: Date;
}
