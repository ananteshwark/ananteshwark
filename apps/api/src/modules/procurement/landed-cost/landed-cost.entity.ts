import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum LandedCostStatus {
  DRAFT     = 'DRAFT',
  POSTED    = 'POSTED',
  CANCELLED = 'CANCELLED',
}

export enum AllocationBasis {
  VALUE    = 'VALUE',    // allocate by line value (qty × PO unit price)
  QUANTITY = 'QUANTITY', // allocate by accepted quantity
}

export type LandedChargeType = 'FREIGHT' | 'DUTY' | 'INSURANCE' | 'HANDLING' | 'OTHER';

export interface LandedCharge {
  type: LandedChargeType;
  description?: string;
  amount: number;
}

export interface LandedAllocation {
  grnLineId: string;
  description: string;
  quantityAccepted: number;
  basisValue: number;       // line value or quantity depending on basis
  allocatedAmount: number;  // share of total charges
  unitCostDelta: number;    // allocatedAmount / quantityAccepted
}

/**
 * Landed cost document: freight/duty/insurance charged against a goods
 * receipt, allocated over its accepted lines so inventory carries the true
 * acquisition cost.
 */
@Entity('lc_documents')
@Index(['tenantId', 'docNumber'], { unique: true })
@Index(['tenantId', 'grnId'])
export class LandedCostDoc {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'doc_number', length: 20 }) docNumber: string;
  @Column({ name: 'grn_id' }) grnId: string;
  @Column({ name: 'grn_number', nullable: true }) grnNumber: string | null;
  @Column({ type: 'enum', enum: LandedCostStatus, default: LandedCostStatus.DRAFT })
  status: LandedCostStatus;
  @Column({ name: 'allocation_basis', type: 'enum', enum: AllocationBasis, default: AllocationBasis.VALUE })
  allocationBasis: AllocationBasis;
  @Column({ type: 'jsonb' }) charges: LandedCharge[];
  @Column({ name: 'total_charges', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  totalCharges: number;
  @Column({ type: 'jsonb', default: () => "'[]'" }) allocations: LandedAllocation[];
  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true }) postedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
