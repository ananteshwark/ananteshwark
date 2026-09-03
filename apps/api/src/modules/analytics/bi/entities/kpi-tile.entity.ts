import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Ph-254 — A homepage KPI tile: an aggregated measure over a subject area with
 * a target and an optional drill-through to a saved report.
 */
@Entity('bi_kpi_tiles')
@Index(['tenantId', 'dashboardId'])
export class KpiTile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'dashboard_id', length: 60, default: 'home' })
  dashboardId: string;

  @Column({ length: 120 })
  title: string;

  @Column({ name: 'subject_area_code', length: 60 })
  subjectAreaCode: string;

  @Column({ length: 60 })
  measure: string;

  @Column({ length: 10, default: 'SUM' })
  agg: string;

  @Column({ type: 'jsonb', default: [] })
  filters: Array<{ field: string; op: string; value: any }>;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true, transformer: decimalTransformer })
  target: number | null;

  @Column({ name: 'drill_report_id', type: 'uuid', nullable: true })
  drillReportId: string | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
