import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-155 — Quality plan attached to a routing operation.
 * Oracle Quality at Operations: a collection point on an operation specifying a
 * characteristic with a spec window; required characteristics that fail block
 * the move to the next operation.
 */
@Entity('mfg_operation_quality_plans')
@Index(['tenantId', 'routingOperationId'])
export class OperationQualityPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'routing_operation_id', type: 'uuid' })
  routingOperationId: string;

  @Column({ name: 'characteristic_name', length: 120 })
  characteristicName: string;

  @Column({ name: 'spec_min', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  specMin: number | null;

  @Column({ name: 'spec_max', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  specMax: number | null;

  @Column({ length: 20, nullable: true })
  uom: string | null;

  @Column({ name: 'is_required', default: true })
  isRequired: boolean;

  @Column({ name: 'block_on_fail', default: true })
  blockOnFail: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
