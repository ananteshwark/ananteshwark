import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DepreciationMethod } from './asset-category.entity';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum AssetStatus {
  ACTIVE    = 'ACTIVE',
  DISPOSED  = 'DISPOSED',
  IMPAIRED  = 'IMPAIRED',
  RETIRED   = 'RETIRED',
}

@Entity('fin_fixed_assets')
export class FixedAsset {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'asset_code', length: 50 }) assetCode: string;
  @Column() name: string;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'category_id', type: 'uuid' }) categoryId: string;
  @Column({ name: 'location', length: 200, nullable: true }) location: string | null;
  @Column({ name: 'serial_number', length: 100, nullable: true }) serialNumber: string | null;

  @Column({ name: 'acquisition_date', type: 'date' }) acquisitionDate: string;
  @Column({ name: 'acquisition_cost', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  acquisitionCost: number;
  @Column({ name: 'residual_value', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  residualValue: number;
  @Column({ name: 'useful_life_months', type: 'int' }) usefulLifeMonths: number;

  @Column({ name: 'depreciation_method', type: 'enum', enum: DepreciationMethod })
  depreciationMethod: DepreciationMethod;
  @Column({ name: 'accumulated_depreciation', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  accumulatedDepreciation: number;
  @Column({ name: 'net_book_value', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer })
  netBookValue: number;

  @Column({ name: 'gl_account_id', type: 'uuid', nullable: true }) glAccountId: string | null;
  @Column({ name: 'depreciation_gl_account_id', type: 'uuid', nullable: true }) depreciationGlAccountId: string | null;
  @Column({ name: 'accumulated_dep_gl_account_id', type: 'uuid', nullable: true }) accumulatedDepGlAccountId: string | null;

  @Column({ name: 'disposal_date', type: 'date', nullable: true }) disposalDate: string | null;
  @Column({ name: 'disposal_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  disposalAmount: number | null;
  @Column({ name: 'disposal_reason', nullable: true }) disposalReason: string | null;

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.ACTIVE }) status: AssetStatus;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
