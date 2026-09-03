import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export interface ApproverChainEntry {
  type: 'role' | 'user' | 'manager';
  value: string;
}

/**
 * One routing rule of the approval matrix: documents of `docType` whose
 * amount falls in [minAmount, maxAmount] (and optionally belong to a given
 * org unit) are approved by `approverChain`, one sequential step per entry.
 */
@Entity('wf_approval_matrix')
@Index(['tenantId', 'docType'])
export class ApprovalMatrixRule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column() name: string;
  // e.g. PURCHASE_ORDER, PURCHASE_REQUISITION, EXPENSE_CLAIM, SALES_ORDER, TRAVEL_REQUEST
  @Column({ name: 'doc_type', length: 50 }) docType: string;
  @Column({ name: 'min_amount', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  minAmount: number;
  // null = unbounded upper band
  @Column({ name: 'max_amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  maxAmount: number | null;
  // null = applies to any org unit; a matching org unit beats a generic rule
  @Column({ name: 'org_unit_id', nullable: true }) orgUnitId: string | null;
  @Column({ name: 'approver_chain', type: 'jsonb' }) approverChain: ApproverChainEntry[];
  @Column({ type: 'int', default: 0 }) priority: number;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  // The auto-generated workflow definition this rule routes into.
  @Column({ name: 'definition_id', nullable: true }) definitionId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
