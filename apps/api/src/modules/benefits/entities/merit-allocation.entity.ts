import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum AllocationStatus {
  DRAFT    = 'DRAFT',
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('comp_merit_allocations')
@Index(['tenantId', 'cycleId', 'employeeId'], { unique: true })
export class MeritAllocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'cycle_id', type: 'uuid' }) cycleId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'current_salary', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) currentSalary: number;
  @Column({ name: 'proposed_increase_pct', type: 'numeric', precision: 5, scale: 2, default: 0, transformer: decimalTransformer }) proposedIncreasePct: number;
  @Column({ name: 'new_salary', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) newSalary: number;
  @Column({ type: 'enum', enum: AllocationStatus, default: AllocationStatus.DRAFT }) status: AllocationStatus;
  @Column({ nullable: true }) comments: string | null;
  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
