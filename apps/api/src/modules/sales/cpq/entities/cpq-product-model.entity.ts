import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export interface CpqOption {
  code: string;
  name: string;
  priceDelta: number;
}

export interface CpqOptionGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: CpqOption[];
}

export interface CpqConstraint {
  type: 'REQUIRES' | 'EXCLUDES';
  if: string;   // option code
  then: string; // option code
}

/**
 * Ph-220 — A configurable product model: option groups with min/max selection
 * rules and cross-option constraints (requires/excludes).
 */
@Entity('cpq_product_models')
@Index(['tenantId', 'code'], { unique: true })
export class CpqProductModel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'base_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  basePrice: number;

  @Column({ name: 'option_groups', type: 'jsonb', default: [] })
  optionGroups: CpqOptionGroup[];

  @Column({ type: 'jsonb', default: [] })
  constraints: CpqConstraint[];

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
