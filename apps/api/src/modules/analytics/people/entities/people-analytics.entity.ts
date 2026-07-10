import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum AnalyticsTier {
  VIEWER = 'VIEWER',     // consume shared dashboards/storyboards only
  EXPLORER = 'EXPLORER', // + ad-hoc metrics and storyboards
  CREATOR = 'CREATOR',   // + author and publish for others
}

/** A user's people-analytics license tier. */
@Entity('an_licenses')
@Index(['tenantId', 'userId'], { unique: true })
@Index(['tenantId', 'tier'])
export class AnalyticsLicense {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ type: 'enum', enum: AnalyticsTier, default: AnalyticsTier.VIEWER }) tier: AnalyticsTier;
  @Column({ name: 'assigned_by_user_id', nullable: true }) assignedByUserId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/** Per-tenant seat caps per tier (null cap = unlimited). */
@Entity('an_seat_policies')
@Index(['tenantId'], { unique: true })
export class AnalyticsSeatPolicy {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  // e.g. { VIEWER: null, EXPLORER: 20, CREATOR: 5 }
  @Column({ type: 'jsonb', default: () => "'{}'" }) limits: Partial<Record<AnalyticsTier, number | null>>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A composed (custom) metric: an aggregation over a subject area with optional
 * dimension and filters. The composer output that dashboard widgets and
 * storyboard slides reference.
 */
@Entity('an_metrics')
@Index(['tenantId', 'key'], { unique: true })
export class AnalyticsMetric {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 80 }) key: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'subject_area_code', length: 60 }) subjectAreaCode: string;
  @Column({ length: 60 }) measure: string;
  @Column({ length: 10, default: 'SUM' }) agg: string; // SUM | AVG | COUNT | MIN | MAX
  @Column({ length: 60, nullable: true }) dimension: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'" }) filters: Array<{ field: string; op: string; value: any }>;
  @Column({ length: 20, default: 'number' }) format: string; // number | percent | currency
  @Column({ name: 'created_by_user_id', nullable: true }) createdByUserId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum StoryboardStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

/**
 * A narrative sequence of slides, each pointing at a dashboard/report/metrics
 * plus commentary — the "story" layer over raw dashboards.
 */
@Entity('an_storyboards')
@Index(['tenantId', 'status'])
export class Storyboard {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'enum', enum: StoryboardStatus, default: StoryboardStatus.DRAFT }) status: StoryboardStatus;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string | null;
  // Ordered slides.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  slides: Array<{ title: string; narrative?: string; dashboardId?: string; reportId?: string; metricKeys?: string[] }>;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
