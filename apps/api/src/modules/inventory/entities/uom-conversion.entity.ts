import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

@Entity('inv_uom_conversions')
@Index(['tenantId', 'itemId', 'fromUom', 'toUom'], { unique: true })
export class UomConversion {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'item_id', type: 'uuid', nullable: true }) itemId: string | null;
  @Column({ name: 'from_uom', length: 20 }) fromUom: string;
  @Column({ name: 'to_uom', length: 20 }) toUom: string;
  @Column({ name: 'conversion_factor', type: 'numeric', precision: 18, scale: 8, transformer: decimalTransformer }) conversionFactor: number;
  @CreateDateColumn() createdAt: Date;
}
