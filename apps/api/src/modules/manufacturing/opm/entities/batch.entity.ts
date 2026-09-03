import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum BatchStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED', // produced, awaiting lab
  LAB_HOLD = 'LAB_HOLD',
  RELEASED = 'RELEASED', // lab-released to stock
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

/**
 * Ph-160 — Process-manufacturing batch (quantity-scaled from a formula).
 * Holds the scaled ingredient requirements and the co-/by-product outputs,
 * plus operation steps and the lab release gate.
 */
@Entity('opm_batches')
@Index(['tenantId', 'status'])
export class Batch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'batch_number', length: 40 })
  batchNumber: string;

  @Column({ name: 'formula_id', type: 'uuid' })
  formulaId: string;

  @Column({ name: 'product_item_id', type: 'uuid' })
  productItemId: string;

  @Column({ name: 'target_output', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  targetOutput: number;

  @Column({ name: 'scale_factor', type: 'numeric', precision: 18, scale: 6, default: 1, transformer: decimalTransformer })
  scaleFactor: number;

  @Column({ name: 'actual_output', type: 'numeric', precision: 18, scale: 4, nullable: true, transformer: decimalTransformer })
  actualOutput: number | null;

  @Column({ type: 'enum', enum: BatchStatus, default: BatchStatus.PLANNED })
  status: BatchStatus;

  @Column({ type: 'jsonb', default: [] })
  ingredients: Array<{ itemId: string; quantity: number; uom: string }>;

  @Column({ type: 'jsonb', default: [] })
  outputs: Array<{ itemId: string; lineType: string; quantity: number; uom: string }>;

  @Column({ name: 'operations', type: 'jsonb', default: [] })
  operations: Array<{ sequence: number; description: string; equipmentId?: string; status: string }>;

  @Column({ name: 'lab_result', length: 20, nullable: true })
  labResult: string | null; // PASS / FAIL

  @Column({ name: 'lab_note', type: 'text', nullable: true })
  labNote: string | null;

  @Column({ name: 'lot_number', length: 100, nullable: true })
  lotNumber: string | null;

  @Column({ name: 'planned_date', type: 'date', nullable: true })
  plannedDate: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'released_at', type: 'timestamp', nullable: true })
  releasedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
