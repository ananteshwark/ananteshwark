import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum KpiTrend {
  HIGHER_BETTER = 'HIGHER_BETTER',
  LOWER_BETTER  = 'LOWER_BETTER',
  ON_TARGET     = 'ON_TARGET',
}

@Entity('ana_kpi_definitions')
@Index(['tenantId', 'code'], { unique: true })
export class KpiDefinition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 50 }) code: string;
  @Column() name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ name: 'sql_query', type: 'text' }) sqlQuery: string;
  @Column({ name: 'unit', nullable: true }) unit: string | null;
  @Column({ name: 'target_value', type: 'numeric', precision: 18, scale: 2, nullable: true }) targetValue: number | null;
  @Column({ name: 'trend_direction', type: 'enum', enum: KpiTrend, default: KpiTrend.HIGHER_BETTER }) trendDirection: KpiTrend;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
