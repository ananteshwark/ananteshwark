import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum VarianceType {
  PPV = 'PPV', // purchase price variance (PO price vs standard)
  MUV = 'MUV', // material usage variance
  LRV = 'LRV', // labor rate variance
  SUV = 'SUV', // subcontract usage variance
  REVALUATION = 'REVALUATION', // standard cost update revaluation
}

/**
 * Ph-138/140 — A recorded cost variance for analysis.
 */
@Entity('inv_cost_variances')
@Index(['tenantId', 'varianceType', 'itemId'])
@Index(['tenantId', 'varianceDate'])
export class CostVariance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'variance_type', type: 'enum', enum: VarianceType })
  varianceType: VarianceType;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'source_type', length: 30, nullable: true })
  sourceType: string | null; // PO_RECEIPT / PRODUCTION / COST_UPDATE

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

  @Column({ name: 'standard_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  standardCost: number;

  @Column({ name: 'actual_cost', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  actualCost: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  quantity: number;

  @Column({ name: 'variance_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  varianceAmount: number;

  @Column({ name: 'variance_date', type: 'date' })
  varianceDate: string;

  @Column({ name: 'vendor_id', type: 'uuid', nullable: true })
  vendorId: string | null;

  @Column({ name: 'work_center_id', type: 'uuid', nullable: true })
  workCenterId: string | null;

  @CreateDateColumn() createdAt: Date;
}
