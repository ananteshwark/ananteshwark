import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum QualityVerdict {
  PASS = 'PASS',
  FAIL = 'FAIL',
}

/**
 * Ph-156 — In-process quality collection result for an operation on a
 * production order. Used to gate the move and to compute first-pass yield.
 */
@Entity('mfg_operation_quality_results')
@Index(['tenantId', 'productionOrderId', 'routingOperationId'])
@Index(['tenantId', 'workCenterId'])
export class OperationQualityResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'production_order_id', type: 'uuid' })
  productionOrderId: string;

  @Column({ name: 'routing_operation_id', type: 'uuid' })
  routingOperationId: string;

  @Column({ name: 'work_center_id', type: 'uuid', nullable: true })
  workCenterId: string | null;

  @Column({ name: 'item_id', type: 'uuid', nullable: true })
  itemId: string | null;

  @Column({ name: 'characteristic_name', length: 120 })
  characteristicName: string;

  @Column({ name: 'measured_value', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  measuredValue: number | null;

  @Column({ type: 'enum', enum: QualityVerdict })
  verdict: QualityVerdict;

  @Column({ name: 'attempt_number', type: 'int', default: 1 })
  attemptNumber: number;

  @Column({ name: 'ncr_id', type: 'uuid', nullable: true })
  ncrId: string | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;

  @CreateDateColumn() createdAt: Date;
}
