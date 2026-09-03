import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ForecastCategory {
  COMMIT = 'COMMIT',
  BEST_CASE = 'BEST_CASE',
  PIPELINE = 'PIPELINE',
  OMITTED = 'OMITTED',
}

/**
 * Ph-214 — Forecast-category assignment for an opportunity within a period.
 */
@Entity('crm_forecast_categories')
@Index(['tenantId', 'opportunityId', 'period'], { unique: true })
export class ForecastCategoryAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'opportunity_id', type: 'uuid' })
  opportunityId: string;

  @Column({ name: 'owner_id', type: 'varchar' })
  ownerId: string;

  @Column({ length: 7 })
  period: string; // YYYY-Qn

  @Column({ type: 'enum', enum: ForecastCategory, default: ForecastCategory.PIPELINE })
  category: ForecastCategory;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
