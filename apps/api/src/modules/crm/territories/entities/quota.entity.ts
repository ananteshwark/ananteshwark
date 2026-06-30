import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-218 — A quota for a rep × territory × product family × quarter.
 */
@Entity('crm_quotas')
@Index(['tenantId', 'repId', 'territoryId', 'productFamily', 'period'], { unique: true })
export class Quota {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'rep_id', type: 'varchar' })
  repId: string;

  @Column({ name: 'territory_id', type: 'uuid', nullable: true })
  territoryId: string | null;

  @Column({ name: 'product_family', length: 80, default: 'ALL' })
  productFamily: string;

  @Column({ length: 7 })
  period: string; // YYYY-Qn

  @Column({ name: 'quota_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  quotaAmount: number;

  @Column({ length: 10, default: 'INR' })
  currency: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
