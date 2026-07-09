import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum InstallStatus {
  INSTALLED = 'INSTALLED',
  UNINSTALLED = 'UNINSTALLED',
}

/** What an install actually created, so uninstall can remove exactly that. */
export interface AppliedResources {
  customObjectIds: string[];
  webhookIds: string[];
  menuItems: Array<{ label: string; path: string; icon?: string }>;
  warnings: string[];
}

@Entity('mkt_installs')
@Index(['tenantId', 'slug'], { unique: true })
export class ExtensionInstall {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'listing_id', type: 'uuid' }) listingId: string;
  @Column({ length: 60 }) slug: string;
  @Column({ length: 100 }) name: string;
  @Column({ length: 20 }) version: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) config: Record<string, any>;
  @Column({ type: 'jsonb', nullable: true }) applied: AppliedResources | null;
  @Column({ type: 'enum', enum: InstallStatus, default: InstallStatus.INSTALLED })
  status: InstallStatus;
  @Column({ name: 'installed_by_user_id', nullable: true }) installedByUserId: string | null;
  @Column({ name: 'uninstalled_at', type: 'timestamptz', nullable: true }) uninstalledAt: Date | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
