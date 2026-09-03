import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-149 — Configure-to-Order (CTO).
 *
 * A CtoOptionMapping expresses how a selected configuration option mutates the
 * base bill of materials of a configurable model: it can ADD a component,
 * REMOVE a base component, or SUBSTITUTE one base component for another. The
 * explosion engine applies these against the model's base components to derive
 * a concrete variant BOM for the configured item.
 */
export enum CtoAction {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  SUBSTITUTE = 'SUBSTITUTE',
}

@Entity('cto_option_mappings')
@Index(['tenantId', 'modelCode'])
export class CtoOptionMapping {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'model_code', length: 50 }) modelCode: string;
  // 'BASE' marks components always present regardless of options selected.
  @Column({ name: 'option_code', length: 50 }) optionCode: string;
  @Column({ type: 'enum', enum: CtoAction, default: CtoAction.ADD }) action: CtoAction;
  @Column({ name: 'component_code', length: 100 }) componentCode: string;
  @Column({ name: 'component_name' }) componentName: string;
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 1, transformer: decimalTransformer }) quantity: number;
  @Column({ length: 20, default: 'EA' }) uom: string;
  // For SUBSTITUTE: the base component code being replaced.
  @Column({ name: 'substitute_for_code', length: 100, nullable: true }) substituteForCode: string | null;
  @CreateDateColumn() createdAt: Date;
}

export enum CtoStatus {
  CONFIGURED = 'CONFIGURED',
  RELEASED = 'RELEASED',
  CANCELLED = 'CANCELLED',
}

export interface CtoVariantComponent {
  componentCode: string;
  componentName: string;
  quantity: number;
  uom: string;
  source: 'BASE' | string; // 'BASE' or the option code that introduced it
}

@Entity('cto_configurations')
@Index(['tenantId', 'configNumber'], { unique: true })
export class CtoConfiguration {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'config_number', length: 40 }) configNumber: string;
  @Column({ name: 'model_code', length: 50 }) modelCode: string;
  @Column({ name: 'model_name', nullable: true }) modelName: string | null;
  @Column({ name: 'sales_order_line_id', type: 'uuid', nullable: true }) salesOrderLineId: string | null;
  @Column({ name: 'variant_item_code', length: 120 }) variantItemCode: string;
  @Column({ name: 'selected_options', type: 'jsonb', default: [] }) selectedOptions: string[];
  @Column({ name: 'variant_bom', type: 'jsonb', default: [] }) variantBom: CtoVariantComponent[];
  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) unitPrice: number;
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 1, transformer: decimalTransformer }) quantity: number;
  @Column({ type: 'enum', enum: CtoStatus, default: CtoStatus.CONFIGURED }) status: CtoStatus;
  @Column({ name: 'work_order_number', length: 40, nullable: true }) workOrderNumber: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
