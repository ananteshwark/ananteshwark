import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum PutawayRuleType {
  FIXED_BIN = 'FIXED_BIN',
  ITEM_ZONE = 'ITEM_ZONE',
  CATEGORY_ZONE = 'CATEGORY_ZONE',
  CONSOLIDATE = 'CONSOLIDATE',
  NEAREST_EMPTY = 'NEAREST_EMPTY',
}

@Entity('inv_putaway_rules')
@Index(['tenantId', 'warehouseId', 'priority'])
export class PutawayRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'warehouse_id', type: 'uuid' }) warehouseId: string;
  @Column({ length: 100 }) name: string;
  @Column({ name: 'rule_type', type: 'enum', enum: PutawayRuleType }) ruleType: PutawayRuleType;
  @Column({ type: 'int', default: 50 }) priority: number;
  @Column({ name: 'item_id', type: 'uuid', nullable: true }) itemId: string | null;
  @Column({ name: 'item_category_id', type: 'uuid', nullable: true }) itemCategoryId: string | null;
  @Column({ name: 'dest_bin_id', type: 'uuid', nullable: true }) destBinId: string | null;
  @Column({ name: 'dest_zone', length: 50, nullable: true }) destZone: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
