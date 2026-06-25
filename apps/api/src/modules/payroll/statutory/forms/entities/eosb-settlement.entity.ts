import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { decimalTransformer } from '../../../../../common/transformers/decimal.transformer';

export enum EosbTerminationType {
  RESIGNATION = 'RESIGNATION',
  TERMINATION = 'TERMINATION',
  END_OF_CONTRACT = 'END_OF_CONTRACT',
}

export enum EosbSettlementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

/**
 * UAE End-of-Service Benefit (gratuity) settlement under Federal Decree-Law
 * No. 33 of 2021: 21 days' basic wage for each of the first five years and
 * 30 days for each subsequent year, capped at two years' total wage.
 */
@Entity('pay_eosb_settlements')
@Index(['tenantId', 'employeeId'])
export class EosbSettlement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'employee_name', length: 200, nullable: true }) employeeName: string | null;

  @Column({ name: 'last_drawn_basic', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) lastDrawnBasic: number;
  @Column({ name: 'join_date', type: 'date' }) joinDate: string;
  @Column({ name: 'separation_date', type: 'date' }) separationDate: string;
  @Column({ name: 'years_of_service', type: 'numeric', precision: 6, scale: 3 }) yearsOfService: number;
  @Column({ name: 'termination_type', type: 'enum', enum: EosbTerminationType, default: EosbTerminationType.RESIGNATION }) terminationType: EosbTerminationType;

  @Column({ name: 'eosb_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) eosbAmount: number;
  @Column({ name: 'currency', length: 3, default: 'AED' }) currency: string;

  @Column({ type: 'enum', enum: EosbSettlementStatus, default: EosbSettlementStatus.PENDING }) status: EosbSettlementStatus;
  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true }) paidAt: Date | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
