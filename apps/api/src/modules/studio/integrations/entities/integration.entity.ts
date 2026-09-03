import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * A declarative integration/transform script. Steps are a whitelisted DSL
 * (filter/map/select/aggregate/sort/limit) applied to input rows — NO arbitrary
 * code execution, so it runs safely without a sandbox VM.
 */
@Entity('st_integration_scripts')
@Index(['tenantId', 'key'], { unique: true })
export class IntegrationScript {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 80 }) key: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Ordered pipeline, e.g. [{ op:'filter', field:'active', cmp:'eq', value:true }, { op:'select', fields:['id','name'] }].
  @Column({ type: 'jsonb', default: () => "'[]'" }) steps: Array<Record<string, any>>;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum DeliveryType {
  NONE = 'NONE',
  SFTP = 'SFTP',
  WEBHOOK = 'WEBHOOK',
}

/**
 * A scheduled run of a script on a fixed interval, optionally delivering the
 * output to an external target via the delivery seam.
 */
@Entity('st_scheduled_jobs')
@Index(['tenantId', 'active'])
export class ScheduledJob {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'script_key', length: 80 }) scriptKey: string;
  @Column({ name: 'interval_minutes', type: 'int', default: 1440 }) intervalMinutes: number;
  @Column({ name: 'delivery_type', type: 'enum', enum: DeliveryType, default: DeliveryType.NONE }) deliveryType: DeliveryType;
  // Delivery config (host/path for SFTP, url for webhook). Secrets are references, not raw values.
  @Column({ name: 'delivery_config', type: 'jsonb', default: () => "'{}'" }) deliveryConfig: Record<string, any>;
  @Column({ default: true }) active: boolean;
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true }) lastRunAt: Date | null;
  @Column({ name: 'next_run_at', type: 'timestamptz', nullable: true }) nextRunAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

export enum ApiSourceType {
  LOOKUP_TABLE = 'LOOKUP_TABLE',
  SCRIPT = 'SCRIPT',
}

/** A tenant-defined read API: a named path backed by a lookup table or script. */
@Entity('st_api_definitions')
@Index(['tenantId', 'path'], { unique: true })
export class ApiDefinition {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) path: string;
  @Column({ length: 200 }) name: string;
  @Column({ name: 'source_type', type: 'enum', enum: ApiSourceType }) sourceType: ApiSourceType;
  @Column({ name: 'source_ref', length: 120 }) sourceRef: string;   // lookup table key or script key
  @Column({ name: 'scope_required', length: 80, nullable: true }) scopeRequired: string | null;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
