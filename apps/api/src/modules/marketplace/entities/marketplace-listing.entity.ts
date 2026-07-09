import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ListingVisibility {
  PUBLIC = 'PUBLIC',   // every tenant can browse and install
  PRIVATE = 'PRIVATE', // only the publishing tenant sees it
}

export enum ListingStatus {
  PUBLISHED = 'PUBLISHED',
  DEPRECATED = 'DEPRECATED',
}

/**
 * Extension manifest: everything an install applies or surfaces. Declarative
 * only — no code execution — so installing an extension is auditable and
 * fully reversible.
 */
export interface ExtensionManifest {
  /** Custom objects created through the extensibility module. */
  customObjects?: Array<{
    name: string; apiName: string; sidebarLabel?: string; icon?: string;
    fields: Array<{ name: string; label: string; type: string; required?: boolean }>;
    listViewColumns?: string[];
  }>;
  /** Outbound webhooks registered against automation events. */
  webhooks?: Array<{ name: string; targetUrl: string; eventTypes: string[] }>;
  /** Navigation entries the web shell renders for installed extensions. */
  menuItems?: Array<{ label: string; path: string; icon?: string }>;
  /** Per-tenant configuration the installer must provide. */
  settings?: Array<{ key: string; label: string; type: 'string' | 'number' | 'boolean'; required?: boolean }>;
}

@Entity('mkt_listings')
@Index(['slug'], { unique: true })
export class MarketplaceListing {
  @PrimaryGeneratedColumn('uuid') id: string;
  // Null publisher = platform-published (first-party catalog).
  @Column({ name: 'publisher_tenant_id', type: 'uuid', nullable: true }) publisherTenantId: string | null;
  @Column({ length: 100 }) name: string;
  @Column({ length: 60 }) slug: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ length: 40, default: 'general' }) category: string;
  @Column({ length: 20 }) version: string;
  @Column({ type: 'jsonb' }) manifest: ExtensionManifest;
  @Column({ type: 'enum', enum: ListingVisibility, default: ListingVisibility.PUBLIC })
  visibility: ListingVisibility;
  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.PUBLISHED })
  status: ListingStatus;
  @Column({ name: 'install_count', type: 'int', default: 0 }) installCount: number;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
