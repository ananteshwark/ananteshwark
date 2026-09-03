import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum CipStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  CAPITALIZED = 'CAPITALIZED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-116 — Construction-in-Progress asset.
 * Accumulates costs until capitalization, when it converts to an in-service
 * FixedAsset. Oracle equivalent: Oracle Assets CIP.
 */
@Entity('fin_fa_cip_assets')
@Index(['tenantId', 'status'])
export class CipAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cip_code', length: 50 })
  cipCode: string;

  @Column({ length: 200 })
  name: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'accumulated_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  accumulatedCost: number;

  @Column({ type: 'enum', enum: CipStatus, default: CipStatus.IN_PROGRESS })
  status: CipStatus;

  @Column({ name: 'cost_lines', type: 'jsonb', nullable: true })
  costLines: any | null; // [{ date, description, amount, sourceRef }]

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'capitalized_date', type: 'date', nullable: true })
  capitalizedDate: string | null;

  @Column({ name: 'asset_id', type: 'uuid', nullable: true })
  assetId: string | null; // FixedAsset created on capitalization

  @Column({ name: 'cip_gl_account_id', type: 'uuid', nullable: true })
  cipGlAccountId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
