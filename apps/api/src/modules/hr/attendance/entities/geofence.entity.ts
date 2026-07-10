import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { decimalTransformer } from '../../../../common/transformers/decimal.transformer';

/**
 * Geofence for attendance check-in: a circle (lat/lng + radius) plus optional
 * IP allowlist. A check-in that supplies coordinates must fall inside an
 * active fence; IP-restricted fences additionally require an allowlisted IP.
 */
@Entity('hr_geofences')
@Index(['tenantId', 'isActive'])
export class Geofence {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: decimalTransformer }) lat: number;
  @Column({ type: 'numeric', precision: 10, scale: 7, transformer: decimalTransformer }) lng: number;
  @Column({ name: 'radius_meters', type: 'int', default: 200 }) radiusMeters: number;
  // Optional CIDR-less IP allowlist (exact IPs); empty = no IP restriction.
  @Column({ name: 'allowed_ips', type: 'jsonb', default: () => "'[]'" }) allowedIps: string[];
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn() createdAt: Date;
}
