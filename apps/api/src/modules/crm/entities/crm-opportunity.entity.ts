import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum OpportunityStage {
  QUALIFICATION = 'QUALIFICATION',
  NEEDS_ANALYSIS = 'NEEDS_ANALYSIS',
  PROPOSAL = 'PROPOSAL',
  NEGOTIATION = 'NEGOTIATION',
  CLOSED_WON = 'CLOSED_WON',
  CLOSED_LOST = 'CLOSED_LOST',
}

@Entity('crm_opportunities')
export class CrmOpportunity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) title: string;
  @Column({ name: 'contact_id', type: 'uuid', nullable: true }) contactId: string | null;
  @Column({ type: 'varchar', nullable: true }) company: string | null;
  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer }) value: number | null;
  @Column({ length: 10, default: 'INR' }) currency: string;
  @Column({ type: 'enum', enum: OpportunityStage, default: OpportunityStage.QUALIFICATION }) stage: OpportunityStage;
  @Column({ type: 'int', default: 0 }) probability: number;
  @Column({ name: 'expected_close_date', type: 'date', nullable: true }) expectedCloseDate: string | null;
  @Column({ name: 'owner_id', type: 'varchar' }) ownerId: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'lost_reason', type: 'text', nullable: true }) lostReason: string | null;
  @Column({ name: 'won_at', type: 'timestamp', nullable: true }) wonAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
