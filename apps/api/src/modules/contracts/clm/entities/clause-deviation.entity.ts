import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ClauseRisk } from './contract-clause.entity';

export enum DeviationStatus {
  PENDING = 'PENDING', // routed to legal
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Ph-210 — A non-standard clause on a contract, flagged against the library's
 * standard text and routed to legal for approval.
 */
@Entity('clm_clause_deviations')
@Index(['tenantId', 'contractId'])
export class ClauseDeviation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'contract_id', type: 'uuid' })
  contractId: string;

  @Column({ name: 'clause_code', length: 50 })
  clauseCode: string;

  @Column({ name: 'standard_text', type: 'text', nullable: true })
  standardText: string | null;

  @Column({ name: 'proposed_text', type: 'text' })
  proposedText: string;

  @Column({ name: 'risk_level', type: 'enum', enum: ClauseRisk, default: ClauseRisk.MEDIUM })
  riskLevel: ClauseRisk;

  @Column({ type: 'enum', enum: DeviationStatus, default: DeviationStatus.PENDING })
  status: DeviationStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
