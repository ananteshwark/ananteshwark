import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export interface BiDimension { key: string; label: string; type: 'string' | 'number' | 'date' }
export interface BiMeasure { key: string; label: string; defaultAgg: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' }

/**
 * Ph-251 — An analytics subject area: a dimensional model (dimensions +
 * measures) for a business pillar (Finance/HCM/SCM/CRM).
 */
@Entity('bi_subject_areas')
@Index(['tenantId', 'code'], { unique: true })
export class SubjectArea {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 60 })
  code: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 40 })
  pillar: string; // FINANCE / HCM / SCM / CRM

  @Column({ type: 'jsonb', default: [] })
  dimensions: BiDimension[];

  @Column({ type: 'jsonb', default: [] })
  measures: BiMeasure[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
