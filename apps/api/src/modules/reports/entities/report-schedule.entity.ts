import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ReportCadence {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

/**
 * A scheduled delivery of a report: on its cadence the hourly sweep runs
 * the report (as its creator, so their permissions apply), renders the
 * CSV and emails it to the recipients. `nextRunAt` rolling forward is
 * the dedupe. A schedule can pin a saved view (edits to the view flow
 * through) or carry its own inline filters.
 */
@Entity('rpt_schedules')
@Index(['tenantId', 'reportCode'])
@Index(['active', 'nextRunAt'])
export class ReportSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'report_code', length: 60 })
  reportCode: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recipients: string[];

  @Column({ type: 'enum', enum: ReportCadence, default: ReportCadence.WEEKLY })
  cadence: ReportCadence;

  /** 0 (Sunday) – 6; WEEKLY only. */
  @Column({ name: 'day_of_week', type: 'int', nullable: true })
  dayOfWeek: number | null;

  /** 1–31, clamped to month length; MONTHLY only. */
  @Column({ name: 'day_of_month', type: 'int', nullable: true })
  dayOfMonth: number | null;

  @Column({ name: 'hour_utc', type: 'int', default: 6 })
  hourUtc: number;

  /** Saved view to run; takes precedence over inline filters. */
  @Column({ name: 'view_id', nullable: true })
  viewId: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  filters: Array<{ field: string; op: string; value?: any }>;

  @Column({ name: 'sort_by', nullable: true })
  sortBy: string | null;

  @Column({ name: 'sort_dir', length: 4, default: 'DESC' })
  sortDir: string;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'next_run_at', type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @Column({ name: 'last_status', length: 20, nullable: true })
  lastStatus: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'created_by_user_id' })
  createdByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
