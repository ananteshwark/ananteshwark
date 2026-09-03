import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ApiKeyStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
}

/**
 * A programmatic API key. Only the SHA-256 hash is stored; the plaintext is
 * shown once at creation. Carries scopes, an optional daily quota, and an
 * alert threshold. Usage counters reset on a rolling 24h window.
 */
@Entity('st_api_keys')
@Index(['tenantId', 'status'])
@Index(['prefix'], { unique: true })
export class ApiKey {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 120 }) name: string;
  // Public, non-secret identifier embedded at the start of the key.
  @Column({ length: 16 }) prefix: string;
  @Column({ name: 'hashed_key', length: 64 }) hashedKey: string;
  @Column({ type: 'jsonb', default: () => "'[]'" }) scopes: string[];
  @Column({ type: 'enum', enum: ApiKeyStatus, default: ApiKeyStatus.ACTIVE }) status: ApiKeyStatus;
  // Requests allowed per rolling day; null = unlimited.
  @Column({ name: 'quota_per_day', type: 'int', nullable: true }) quotaPerDay: number | null;
  @Column({ name: 'usage_count', type: 'int', default: 0 }) usageCount: number;
  @Column({ name: 'usage_window_start', type: 'timestamptz', nullable: true }) usageWindowStart: Date | null;
  // Fire an alert once usage crosses this % of the quota.
  @Column({ name: 'alert_threshold_pct', type: 'int', default: 80 }) alertThresholdPct: number;
  @Column({ name: 'alert_sent', default: false }) alertSent: boolean;
  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true }) lastUsedAt: Date | null;
  @Column({ name: 'expires_at', type: 'date', nullable: true }) expiresAt: string | null;
  @Column({ name: 'created_by_user_id', nullable: true }) createdByUserId: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

/**
 * A tenant-maintained reference / lookup table (e.g. cost-centre → GL account).
 * Columns are declared here; rows hang off it keyed by the first column.
 */
@Entity('st_lookup_tables')
@Index(['tenantId', 'key'], { unique: true })
export class LookupTable {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 80 }) key: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  // Ordered column definitions; the first is the lookup key.
  @Column({ type: 'jsonb', default: () => "'[]'" }) columns: Array<{ key: string; label?: string; type?: string }>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}

@Entity('st_lookup_rows')
@Index(['tenantId', 'tableId'])
@Index(['tenantId', 'tableId', 'lookupKey'], { unique: true })
export class LookupRow {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'table_id', type: 'uuid' }) tableId: string;
  // Value of the first column — the lookup handle.
  @Column({ name: 'lookup_key', length: 200 }) lookupKey: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) values: Record<string, any>;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
