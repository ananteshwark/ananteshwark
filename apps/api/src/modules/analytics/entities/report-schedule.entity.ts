import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ScheduleFrequency {
  DAILY   = 'DAILY',
  WEEKLY  = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

@Entity('ana_report_schedules')
@Index(['tenantId'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'report_id', type: 'uuid' }) reportId: string;
  @Column({ name: 'frequency', type: 'enum', enum: ScheduleFrequency }) frequency: ScheduleFrequency;
  @Column({ name: 'send_to', type: 'jsonb', default: [] }) sendTo: string[];
  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true }) nextRunAt: Date | null;
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true }) lastRunAt: Date | null;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
