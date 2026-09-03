import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReportCategory {
  FINANCE  = 'FINANCE',
  HR       = 'HR',
  SALES    = 'SALES',
  INVENTORY = 'INVENTORY',
  PROCUREMENT = 'PROCUREMENT',
  CUSTOM   = 'CUSTOM',
}

export enum ReportFormat {
  TABLE = 'TABLE',
  BAR_CHART = 'BAR_CHART',
  LINE_CHART = 'LINE_CHART',
  PIE_CHART = 'PIE_CHART',
  KPI_CARD = 'KPI_CARD',
}

@Entity('ana_report_definitions')
@Index(['tenantId', 'code'], { unique: true })
export class ReportDefinition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 100 }) code: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: ReportCategory }) category: ReportCategory;
  @Column({ type: 'enum', enum: ReportFormat, default: ReportFormat.TABLE }) format: ReportFormat;
  @Column({ name: 'sql_query', type: 'text' }) sqlQuery: string;
  @Column({ type: 'jsonb', default: [] }) parameters: Array<{ name: string; label: string; type: 'date' | 'string' | 'number' | 'uuid'; required: boolean }>;
  @Column({ type: 'jsonb', default: [] }) columns: Array<{ key: string; label: string; type: 'text' | 'number' | 'date' | 'currency'; format?: string }>;
  @Column({ name: 'is_public', default: false }) isPublic: boolean;
  @Column({ name: 'created_by_id', type: 'uuid', nullable: true }) createdById: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
