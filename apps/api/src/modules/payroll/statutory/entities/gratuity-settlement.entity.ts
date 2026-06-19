import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

export enum GratuitySettlementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  REJECTED = 'REJECTED',
}

@Entity('pay_gratuity_settlements')
export class GratuitySettlement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'employee_id', type: 'uuid' }) employeeId: string;
  @Column({ name: 'last_drawn_basic', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) lastDrawnBasic: number;
  @Column({ name: 'years_of_service', type: 'numeric', precision: 5, scale: 2 }) yearsOfService: number;
  @Column({ name: 'gratuity_amount', type: 'numeric', precision: 18, scale: 2, transformer: decimalTransformer }) gratuityAmount: number;
  @Column({ name: 'separation_date', type: 'date' }) separationDate: string;
  @Column({ type: 'enum', enum: GratuitySettlementStatus, default: GratuitySettlementStatus.PENDING }) status: GratuitySettlementStatus;
  @Column({ name: 'approved_by_id', type: 'varchar', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamp', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true }) paidAt: Date | null;
  @Column({ type: 'text', nullable: true }) remarks: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
