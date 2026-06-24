import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum OverheadBase {
  MATERIAL_COST = 'MATERIAL_COST',
  LABOR_COST    = 'LABOR_COST',
  TOTAL_COST    = 'TOTAL_COST',
}

@Entity('co_overhead_costing_sheets')
@Index(['tenantId', 'code'], { unique: true })
export class OverheadCostingSheet {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;

  /**
   * Inline JSONB lines rather than a child table — keeps the feature
   * self-contained without a separate migration and avoids a join.
   * Each line: { sequence, name, base: OverheadBase, rate: number,
   *              debitAccountId: string, creditAccountId: string }
   */
  @Column({ type: 'jsonb', default: '[]' }) lines: OverheadSheetLine[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export interface OverheadSheetLine {
  sequence: number;
  name: string;
  base: OverheadBase;
  /** Percentage rate, e.g. 15 means 15% */
  rate: number;
  debitAccountId: string;
  creditAccountId: string;
}
