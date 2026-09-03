import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum MilestoneStatus {
  PENDING   = 'PENDING',
  COMPLETED = 'COMPLETED',
  OVERDUE   = 'OVERDUE',
}

@Entity('clm_contract_milestones')
export class ContractMilestone {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'contract_id', type: 'uuid' }) contractId: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column({ name: 'completed_date', type: 'date', nullable: true }) completedDate: string | null;
  @Column({ type: 'enum', enum: MilestoneStatus, default: MilestoneStatus.PENDING }) status: MilestoneStatus;
  @Column({ name: 'amount', type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  amount: number | null;
  @Column({ nullable: true }) notes: string | null;
  @CreateDateColumn() createdAt: Date;
}
