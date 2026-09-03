import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReportVisibility {
  PERSONAL = 'PERSONAL',
  SHARED = 'SHARED',
}

export interface ReportMeasure { key: string; agg: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' }
export interface ReportFilter { field: string; op: string; value: any }
export interface ReportSort { key: string; dir: 'ASC' | 'DESC' }

/**
 * Ph-252 — A saved report definition built on a subject area: chosen
 * dimensions, aggregated measures, filters, and sort, saved personal/shared.
 */
@Entity('bi_saved_reports')
@Index(['tenantId', 'ownerId'])
export class SavedReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'subject_area_code', length: 60 })
  subjectAreaCode: string;

  @Column({ type: 'jsonb', default: [] })
  dimensions: string[];

  @Column({ type: 'jsonb', default: [] })
  measures: ReportMeasure[];

  @Column({ type: 'jsonb', default: [] })
  filters: ReportFilter[];

  @Column({ type: 'jsonb', default: [] })
  sort: ReportSort[];

  @Column({ type: 'enum', enum: ReportVisibility, default: ReportVisibility.PERSONAL })
  visibility: ReportVisibility;

  @Column({ name: 'owner_id', type: 'varchar' })
  ownerId: string;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
