import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-274 — A per-tenant IP allowlist entry (CIDR range).
 */
@Entity('sec_ip_allowlist')
@Index(['tenantId'])
export class IpAllowlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 60 })
  cidr: string; // e.g. 203.0.113.0/24 or a single IP

  @Column({ length: 150, nullable: true })
  label: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
