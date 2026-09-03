import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum InspectionLotStatus {
  PENDING     = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  PASSED      = 'PASSED',
  FAILED      = 'FAILED',
}

export enum UsageDecision {
  ACCEPT      = 'ACCEPT',
  REJECT      = 'REJECT',
  CONDITIONAL = 'CONDITIONAL',
}

export enum LotReferenceType {
  GRN        = 'GRN',
  PRODUCTION = 'PRODUCTION',
}

@Entity('qm_inspection_lots')
@Index(['tenantId', 'lotNumber'], { unique: true })
export class InspectionLot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'lot_number', length: 50 }) lotNumber: string;
  @Column({ name: 'plan_id', type: 'uuid' }) planId: string;
  @Column({ name: 'reference_type', type: 'enum', enum: LotReferenceType }) referenceType: LotReferenceType;
  @Column({ name: 'reference_id', type: 'uuid', nullable: true }) referenceId: string | null;
  @Column({ name: 'item_code', length: 100 }) itemCode: string;
  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) quantity: number;
  @Column({ name: 'sample_size', type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer }) sampleSize: number;
  @Column({ name: 'inspection_date', type: 'date' }) inspectionDate: string;
  @Column({ type: 'enum', enum: InspectionLotStatus, default: InspectionLotStatus.PENDING }) status: InspectionLotStatus;
  @Column({ name: 'usage_decision', type: 'enum', enum: UsageDecision, nullable: true }) usageDecision: UsageDecision | null;
  @Column({ name: 'usage_decision_at', type: 'timestamptz', nullable: true }) usageDecisionAt: Date | null;
  @Column({ name: 'usage_decision_by', type: 'uuid', nullable: true }) usageDecisionBy: string | null;
  @Column({ type: 'jsonb', nullable: true }) results: Array<{ checkpointName: string; value?: string | number | null; passed: boolean }> | null;
  @Column({ nullable: true }) remarks: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
