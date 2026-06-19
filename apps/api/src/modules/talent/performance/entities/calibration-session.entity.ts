import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CalibrationStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('tal_calibration_sessions')
export class CalibrationSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'facilitator_id', type: 'varchar' })
  facilitatorId: string;

  @Column({ name: 'employee_ids', type: 'jsonb', default: '[]' })
  employeeIds: string[];

  @Column({ type: 'jsonb', default: '{}' })
  ratings: Record<string, number>;

  @Column({ type: 'jsonb', default: '{}' })
  recommendations: Record<string, string>;

  @Column({ type: 'enum', enum: CalibrationStatus, default: CalibrationStatus.PLANNED })
  status: CalibrationStatus;

  @Column({ name: 'session_date', type: 'date' })
  sessionDate: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
