import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum BomStatus {
  DRAFT  = 'DRAFT',
  ACTIVE = 'ACTIVE',
  OBSOLETE = 'OBSOLETE',
}

@Entity('mfg_boms')
export class Bom {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'bom_number', length: 50 }) bomNumber: string;
  @Column({ name: 'finished_item_code', length: 100 }) finishedItemCode: string;
  @Column({ name: 'finished_item_name' }) finishedItemName: string;
  @Column({ name: 'output_quantity', type: 'numeric', precision: 18, scale: 4, default: 1, transformer: decimalTransformer }) outputQuantity: number;
  @Column({ name: 'output_uom', length: 20, default: 'EA' }) outputUom: string;
  @Column({ type: 'enum', enum: BomStatus, default: BomStatus.DRAFT }) status: BomStatus;
  @Column({ name: 'version', length: 10, default: '1.0' }) version: string;
  @Column({ name: 'effective_from', type: 'date', nullable: true }) effectiveFrom: string | null;
  @Column({ name: 'effective_to', type: 'date', nullable: true }) effectiveTo: string | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('mfg_bom_lines')
export class BomLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'bom_id', type: 'uuid' }) bomId: string;
  @Column({ name: 'line_number', type: 'int' }) lineNumber: number;
  @Column({ name: 'component_code', length: 100 }) componentCode: string;
  @Column({ name: 'component_name' }) componentName: string;
  @Column({ type: 'numeric', precision: 18, scale: 6, transformer: decimalTransformer }) quantity: number;
  @Column({ name: 'uom', length: 20, default: 'EA' }) uom: string;
  @Column({ name: 'scrap_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) scrapPct: number;
  @Column({ name: 'is_phantom', default: false }) isPhantom: boolean;
  @Column({ name: 'sub_bom_id', type: 'uuid', nullable: true }) subBomId: string | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
