import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MarketplaceListing, ListingVisibility, ListingStatus, ExtensionManifest,
} from './entities/marketplace-listing.entity';
import { ExtensionInstall, InstallStatus, AppliedResources } from './entities/extension-install.entity';
import { CustomObject } from '../extensibility/entities/custom-object.entity';
import { ExtensibilityService } from '../extensibility/extensibility.service';
import { WebhooksService } from '../platform/webhooks/webhooks.service';
import { AUTOMATION_EVENT_KEYS } from '../automation/automation-events';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const SETTING_TYPES = ['string', 'number', 'boolean'];

/**
 * Tenant extension marketplace. Extensions are declarative manifests —
 * custom objects, webhook subscriptions, navigation entries, config schema —
 * published as versioned listings and applied through the same platform
 * services a tenant admin would use by hand. Installs record exactly which
 * resources they created so uninstalling removes precisely that set.
 */
@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(MarketplaceListing) private readonly listingRepo: Repository<MarketplaceListing>,
    @InjectRepository(ExtensionInstall) private readonly installRepo: Repository<ExtensionInstall>,
    @Optional() private readonly extensibility?: ExtensibilityService,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() @InjectRepository(CustomObject) private readonly customObjectRepo?: Repository<CustomObject>,
  ) {}

  /** Validate a manifest before anything is published or applied. */
  validateManifest(manifest: ExtensionManifest) {
    if (!manifest || typeof manifest !== 'object') {
      throw new BadRequestException('A manifest object is required');
    }
    const capabilities =
      (manifest.customObjects?.length ?? 0) +
      (manifest.webhooks?.length ?? 0) +
      (manifest.menuItems?.length ?? 0);
    if (!capabilities) {
      throw new BadRequestException('Manifest must declare at least one capability (customObjects, webhooks, or menuItems)');
    }
    for (const obj of manifest.customObjects ?? []) {
      if (!obj.name?.trim() || !obj.apiName?.trim() || !obj.fields?.length) {
        throw new BadRequestException(`Custom object "${obj.name ?? obj.apiName}" needs a name, apiName, and at least one field`);
      }
    }
    for (const hook of manifest.webhooks ?? []) {
      if (!hook.name?.trim() || !hook.targetUrl?.trim() || !hook.eventTypes?.length) {
        throw new BadRequestException(`Webhook "${hook.name}" needs a name, targetUrl, and eventTypes`);
      }
      if (!/^https:\/\//i.test(hook.targetUrl)) {
        throw new BadRequestException(`Webhook "${hook.name}" must use an https:// target URL`);
      }
      const unknown = hook.eventTypes.filter((e) => !AUTOMATION_EVENT_KEYS.has(e));
      if (unknown.length) {
        throw new BadRequestException(`Webhook "${hook.name}" references unknown events: ${unknown.join(', ')}`);
      }
    }
    for (const item of manifest.menuItems ?? []) {
      if (!item.label?.trim() || !item.path?.trim()) {
        throw new BadRequestException('Every menu item needs a label and a path');
      }
    }
    for (const setting of manifest.settings ?? []) {
      if (!setting.key?.trim() || !SETTING_TYPES.includes(setting.type)) {
        throw new BadRequestException(`Setting "${setting.key}" must have a key and a type of ${SETTING_TYPES.join('/')}`);
      }
    }
  }

  /** Publish a new listing, or a new version of one this tenant already publishes. */
  async publish(
    tenantId: string,
    dto: {
      name: string; slug: string; description?: string; category?: string;
      version: string; manifest: ExtensionManifest; visibility?: ListingVisibility;
    },
  ): Promise<MarketplaceListing> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    if (!SLUG_PATTERN.test(dto.slug ?? '')) {
      throw new BadRequestException('slug must be 3-60 chars of lowercase letters, digits, and hyphens');
    }
    if (!SEMVER_PATTERN.test(dto.version ?? '')) {
      throw new BadRequestException('version must be semver (e.g. 1.0.0)');
    }
    this.validateManifest(dto.manifest);

    const existing = await this.listingRepo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      if (existing.publisherTenantId !== tenantId) {
        throw new BadRequestException(`Slug "${dto.slug}" is already taken`);
      }
      if (this.compareVersions(dto.version, existing.version) <= 0) {
        throw new BadRequestException(`Version must be greater than the published ${existing.version}`);
      }
      existing.name = dto.name;
      existing.description = dto.description ?? existing.description;
      existing.category = dto.category ?? existing.category;
      existing.version = dto.version;
      existing.manifest = dto.manifest;
      existing.visibility = dto.visibility ?? existing.visibility;
      existing.status = ListingStatus.PUBLISHED;
      return this.listingRepo.save(existing);
    }

    return this.listingRepo.save(
      this.listingRepo.create({
        publisherTenantId: tenantId,
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        category: dto.category ?? 'general',
        version: dto.version,
        manifest: dto.manifest,
        visibility: dto.visibility ?? ListingVisibility.PUBLIC,
        status: ListingStatus.PUBLISHED,
      }),
    );
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  }

  /** Public catalog plus this tenant's private listings, with install state. */
  async browse(tenantId: string) {
    const listings = await this.listingRepo.find({
      where: { status: ListingStatus.PUBLISHED },
      order: { installCount: 'DESC', name: 'ASC' },
    });
    const visible = listings.filter(
      (l) => l.visibility === ListingVisibility.PUBLIC || l.publisherTenantId === tenantId,
    );
    const installs = await this.installRepo.find({ where: { tenantId, status: InstallStatus.INSTALLED } });
    const installedSlugs = new Map(installs.map((i) => [i.slug, i]));
    return visible.map((l) => ({
      ...l,
      installed: installedSlugs.has(l.slug),
      installedVersion: installedSlugs.get(l.slug)?.version ?? null,
      ownListing: l.publisherTenantId === tenantId,
    }));
  }

  async install(
    tenantId: string,
    userId: string,
    slug: string,
    config: Record<string, any> = {},
  ): Promise<ExtensionInstall> {
    const listing = await this.listingRepo.findOne({ where: { slug } });
    if (!listing || listing.status !== ListingStatus.PUBLISHED) {
      throw new NotFoundException(`Extension "${slug}" not found`);
    }
    if (listing.visibility === ListingVisibility.PRIVATE && listing.publisherTenantId !== tenantId) {
      throw new NotFoundException(`Extension "${slug}" not found`);
    }
    const existing = await this.installRepo.findOne({ where: { tenantId, slug } });
    if (existing && existing.status === InstallStatus.INSTALLED) {
      if (existing.version === listing.version) return existing; // idempotent
      // Upgrade: remove the old footprint, apply the new manifest below.
      await this.removeApplied(tenantId, existing.applied);
    }

    // Required settings must be supplied before anything is applied.
    for (const setting of listing.manifest.settings ?? []) {
      if (setting.required && (config[setting.key] === undefined || config[setting.key] === '')) {
        throw new BadRequestException(`Setting "${setting.key}" is required to install ${listing.name}`);
      }
    }

    const applied = await this.applyManifest(tenantId, listing);

    const install = existing ?? this.installRepo.create({ tenantId, slug });
    install.listingId = listing.id;
    install.name = listing.name;
    install.version = listing.version;
    install.config = config;
    install.applied = applied;
    install.status = InstallStatus.INSTALLED;
    install.installedByUserId = userId;
    install.uninstalledAt = null;
    const saved = await this.installRepo.save(install);

    if (!existing) {
      listing.installCount += 1;
      await this.listingRepo.save(listing);
    }
    return saved;
  }

  private async applyManifest(tenantId: string, listing: MarketplaceListing): Promise<AppliedResources> {
    const applied: AppliedResources = { customObjectIds: [], webhookIds: [], menuItems: [], warnings: [] };
    const m = listing.manifest;

    for (const objDef of m.customObjects ?? []) {
      if (!this.extensibility) {
        applied.warnings.push(`Custom object "${objDef.apiName}" skipped — extensibility module unavailable`);
        continue;
      }
      try {
        const obj = await this.extensibility.createObject(tenantId, objDef as any, `ext:${listing.slug}`);
        applied.customObjectIds.push(obj.id);
      } catch (e: any) {
        applied.warnings.push(`Custom object "${objDef.apiName}": ${e.message}`);
      }
    }

    for (const hookDef of m.webhooks ?? []) {
      if (!this.webhooks) {
        applied.warnings.push(`Webhook "${hookDef.name}" skipped — webhooks module unavailable`);
        continue;
      }
      try {
        const sub = await this.webhooks.createSubscription(tenantId, {
          name: `[${listing.slug}] ${hookDef.name}`,
          targetUrl: hookDef.targetUrl,
          eventTypes: hookDef.eventTypes,
        } as any);
        applied.webhookIds.push(sub.id);
      } catch (e: any) {
        applied.warnings.push(`Webhook "${hookDef.name}": ${e.message}`);
      }
    }

    applied.menuItems = m.menuItems ?? [];
    return applied;
  }

  private async removeApplied(tenantId: string, applied: AppliedResources | null) {
    if (!applied) return;
    for (const id of applied.webhookIds ?? []) {
      try {
        await this.webhooks?.deleteSubscription(tenantId, id);
      } catch { /* already gone */ }
    }
    if (this.customObjectRepo && applied.customObjectIds?.length) {
      for (const id of applied.customObjectIds) {
        await this.customObjectRepo.delete({ id, tenantId } as any);
      }
    }
  }

  async uninstall(tenantId: string, slug: string): Promise<ExtensionInstall> {
    const install = await this.installRepo.findOne({ where: { tenantId, slug } });
    if (!install || install.status !== InstallStatus.INSTALLED) {
      throw new NotFoundException(`Extension "${slug}" is not installed`);
    }
    await this.removeApplied(tenantId, install.applied);
    install.status = InstallStatus.UNINSTALLED;
    install.uninstalledAt = new Date();
    const saved = await this.installRepo.save(install);
    const listing = await this.listingRepo.findOne({ where: { id: install.listingId } });
    if (listing && listing.installCount > 0) {
      listing.installCount -= 1;
      await this.listingRepo.save(listing);
    }
    return saved;
  }

  async installed(tenantId: string): Promise<ExtensionInstall[]> {
    return this.installRepo.find({
      where: { tenantId, status: InstallStatus.INSTALLED },
      order: { createdAt: 'DESC' } as any,
    });
  }

  /** Navigation contributed by installed extensions — consumed by the web shell. */
  async menu(tenantId: string) {
    const installs = await this.installed(tenantId);
    return installs.flatMap((i) =>
      (i.applied?.menuItems ?? []).map((m) => ({ ...m, extension: i.slug })),
    );
  }
}
