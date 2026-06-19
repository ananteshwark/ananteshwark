import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum ItemType {
  STOCK = 'STOCK',
  NON_STOCK = 'NON_STOCK',
  SERVICE = 'SERVICE',
}

@Entity('inv_items')
@Index(['tenantId', 'code'], { unique: true })
export class Item {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'category_id', type: 'uuid', nullable: true }) categoryId: string | null;
  @Column({ length: 20, default: 'EA' }) uom: string;
  @Column({ type: 'enum', enum: ItemType, default: ItemType.STOCK }) type: ItemType;
  @Column({ name: 'reorder_level', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) reorderLevel: number;
  @Column({ name: 'reorder_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) reorderQty: number;
  @Column({ name: 'standard_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) standardCost: number;
  @Column({ name: 'selling_price', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) sellingPrice: number;
  @Column({ name: 'tax_rate', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) taxRate: number;
  @Column({ name: 'gl_inventory_account_code', type: 'varchar', nullable: true }) glInventoryAccountCode: string | null;
  @Column({ name: 'gl_cogs_account_code', type: 'varchar', nullable: true }) glCogsAccountCode: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
