import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Ph-285 — A segregation-of-duties conflict rule: a pair of permissions that
 * must not be held by the same user.
 */
@Entity('grc_sod_rules')
@Index(['tenantId', 'permissionA', 'permissionB'], { unique: true })
export class SodRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'permission_a', length: 100 })
  permissionA: string;

  @Column({ name: 'permission_b', length: 100 })
  permissionB: string;

  @Column({ length: 20, default: 'HIGH' })
  severity: string; // LOW / MEDIUM / HIGH / CRITICAL

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
