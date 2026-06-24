import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { DepreciationMethod } from './asset-category.entity';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

@Entity('fin_asset_depreciation_areas')
@Index(['tenantId', 'assetId', 'areaCode'], { unique: true })
export class AssetDepreciationArea {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'asset_id', type: 'uuid' }) assetId: string;
  @Column({ name: 'area_code', length: 20 }) areaCode: string;
  @Column({ name: 'area_name', length: 100 }) areaName: string;
  @Column({ name: 'ledger_code', length: 20, default: 'MAIN' }) ledgerCode: string;
  @Column({ name: 'depreciation_method', type: 'enum', enum: DepreciationMethod }) depreciationMethod: DepreciationMethod;
  @Column({ name: 'useful_life_months', type: 'int' }) usefulLifeMonths: number;
  @Column({ name: 'residual_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) residualValue: number;
  @Column({ name: 'accumulated_depreciation', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) accumulatedDepreciation: number;
  @Column({ name: 'net_book_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer }) netBookValue: number;
  @Column({ name: 'depreciation_gl_account_id', type: 'uuid', nullable: true }) depreciationGlAccountId: string | null;
  @Column({ name: 'accumulated_dep_gl_account_id', type: 'uuid', nullable: true }) accumulatedDepGlAccountId: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
