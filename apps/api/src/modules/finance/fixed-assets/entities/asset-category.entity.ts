import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum DepreciationMethod {
  SLM = 'SLM', // Straight Line Method
  WDV = 'WDV', // Written Down Value
  DB  = 'DB',  // Double Declining Balance
}

@Entity('fin_asset_categories')
export class AssetCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'enum', enum: DepreciationMethod, default: DepreciationMethod.SLM })
  defaultMethod: DepreciationMethod;
  @Column({ name: 'default_useful_life_months', type: 'int', default: 60 })
  defaultUsefulLifeMonths: number;
  @Column({ name: 'asset_account_code', length: 20, nullable: true }) assetAccountCode: string | null;
  @Column({ name: 'depreciation_account_code', length: 20, nullable: true }) depreciationAccountCode: string | null;
  @Column({ name: 'accumulated_dep_account_code', length: 20, nullable: true }) accumulatedDepAccountCode: string | null;
  @Column({ nullable: true }) description: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
