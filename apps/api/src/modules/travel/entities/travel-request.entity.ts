import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

export enum TravelMode {
  FLIGHT = 'FLIGHT',
  TRAIN  = 'TRAIN',
  BUS    = 'BUS',
  CAR    = 'CAR',
  OTHER  = 'OTHER',
}

export enum TravelRequestStatus {
  DRAFT     = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED  = 'APPROVED',
  REJECTED  = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('trv_requests')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'tripNumber'], { unique: true })
export class TravelRequest {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'trip_number', length: 20 }) tripNumber: string;
  @Column({ name: 'employee_id' }) employeeId: string;
  @Column() purpose: string;
  @Column() origin: string;
  @Column() destination: string;
  @Column({ name: 'start_date', type: 'date' }) startDate: string;
  @Column({ name: 'end_date', type: 'date' }) endDate: string;
  @Column({ name: 'travel_mode', type: 'enum', enum: TravelMode, default: TravelMode.FLIGHT }) travelMode: TravelMode;
  @Column({ name: 'estimated_cost', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  estimatedCost: number;
  @Column({ name: 'advance_requested', type: 'numeric', precision: 18, scale: 2, default: 0, transformer: decimalTransformer })
  advanceRequested: number;
  @Column({ type: 'enum', enum: TravelRequestStatus, default: TravelRequestStatus.DRAFT }) status: TravelRequestStatus;
  @Column({ name: 'approved_by_id', nullable: true }) approvedById: string | null;
  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true }) approvedAt: Date | null;
  @Column({ name: 'rejection_reason', type: 'text', nullable: true }) rejectionReason: string | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  // Set when the post-trip expense claim is filed against this trip.
  @Column({ name: 'expense_claim_id', nullable: true }) expenseClaimId: string | null;
  @Column({ name: 'created_by_user_id' }) createdByUserId: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
