import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-253 — A scheduled delivery of a saved report to recipients.
 */
@Entity('bi_report_schedules')
@Index(['tenantId', 'reportId'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'report_id', type: 'uuid' })
  reportId: string;

  @Column({ length: 100 })
  cron: string; // standard 5-field cron

  @Column({ type: 'jsonb', default: [] })
  recipients: string[];

  @Column({ length: 10, default: 'CSV' })
  format: string; // CSV / PDF / XLSX

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
