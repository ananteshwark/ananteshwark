import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum NcrSeverity {
  LOW      = 'LOW',
  MEDIUM   = 'MEDIUM',
  HIGH     = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum NcrStatus {
  OPEN         = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED     = 'RESOLVED',
  CLOSED       = 'CLOSED',
}

@Entity('qm_ncrs')
@Index(['tenantId', 'ncrNumber'], { unique: true })
export class NonConformance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'ncr_number', length: 50 }) ncrNumber: string;
  @Column({ name: 'inspection_lot_id', type: 'uuid', nullable: true }) inspectionLotId: string | null;
  @Column() title: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: NcrSeverity }) severity: NcrSeverity;
  @Column({ type: 'enum', enum: NcrStatus, default: NcrStatus.OPEN }) status: NcrStatus;
  @Column({ name: 'root_cause', type: 'text', nullable: true }) rootCause: string | null;
  @Column({ name: 'corrective_action', type: 'text', nullable: true }) correctiveAction: string | null;
  @Column({ name: 'preventive_action', type: 'text', nullable: true }) preventiveAction: string | null;
  @Column({ name: 'assigned_to_id', type: 'uuid', nullable: true }) assignedToId: string | null;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
}
