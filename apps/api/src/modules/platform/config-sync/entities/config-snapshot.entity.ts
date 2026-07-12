import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A captured configuration snapshot for an environment. Snapshots can be
 * diffed and promoted between environments (sandbox → prod), built on the
 * tenant-export foundation. The checksum makes tampering/drift detectable.
 */
@Entity('cfg_snapshots')
@Index(['tenantId', 'environment'])
export class ConfigSnapshot {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ length: 200 }) name: string;
  @Column({ length: 40, default: 'SANDBOX' }) environment: string; // SANDBOX | PROD | <custom>
  // Flat settings map, e.g. { 'leave.carryoverCap': 30, 'expense.autoApproveUnder': 50 }.
  @Column({ type: 'jsonb', default: () => "'{}'" }) payload: Record<string, any>;
  @Column({ length: 64 }) checksum: string;
  @Column({ name: 'created_by_user_id', nullable: true }) createdByUserId: string | null;
  @CreateDateColumn() createdAt: Date;
}
