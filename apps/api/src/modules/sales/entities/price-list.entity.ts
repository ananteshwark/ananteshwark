import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('so_price_lists')
export class PriceList {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ name: 'valid_from', type: 'date', nullable: true }) validFrom: string | null;
  @Column({ name: 'valid_to', type: 'date', nullable: true }) validTo: string | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('so_price_list_items')
export class PriceListItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'price_list_id', type: 'uuid' }) priceListId: string;
  @Column({ name: 'item_code', length: 100 }) itemCode: string;
  @Column({ name: 'item_name' }) itemName: string;
  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) unitPrice: number;
  @Column({ name: 'min_qty', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer }) minQty: number;
  @Column({ name: 'discount_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) discountPct: number;
  @Column({ name: 'uom', length: 20, nullable: true }) uom: string | null;
  @CreateDateColumn() createdAt: Date;
}
