import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum CostUpdateStatus {
  DRAFT = 'DRAFT',
  POSTED = 'POSTED',
}

/**
 * Ph-139 — Period-end standard cost update / inventory revaluation.
 * revaluationAmount = (newStandard − oldStandard) × qtyOnHand, posted to GL.
 */
@Entity('inv_cost_updates')
@Index(['tenantId', 'itemId'])
export class CostUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @Column({ name: 'old_standard', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  oldStandard: number;

  @Column({ name: 'new_standard', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  newStandard: number;

  @Column({ name: 'qty_on_hand', type: 'numeric', precision: 18, scale: 4, default: 0, transformer: decimalTransformer })
  qtyOnHand: number;

  @Column({ name: 'revaluation_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  revaluationAmount: number;

  @Column({ type: 'enum', enum: CostUpdateStatus, default: CostUpdateStatus.DRAFT })
  status: CostUpdateStatus;

  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
