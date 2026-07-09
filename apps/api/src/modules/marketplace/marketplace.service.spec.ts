import { MarketplaceService } from './marketplace.service';
import { ListingVisibility, ListingStatus } from './entities/marketplace-listing.entity';
import { InstallStatus } from './entities/extension-install.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x: any) => x),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'gen-1', ...x })),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

const validManifest = {
  customObjects: [{
    name: 'Store', apiName: 'store',
    fields: [{ name: 'code', label: 'Code', type: 'string', required: true }],
  }],
  webhooks: [{ name: 'Notify ERP', targetUrl: 'https://hooks.example.com/x', eventTypes: ['po.approved'] }],
  menuItems: [{ label: 'Stores', path: 'custom/store' }],
  settings: [{ key: 'apiKey', label: 'API key', type: 'string' as const, required: true }],
};

const build = () => {
  const listingRepo = mockRepo();
  const installRepo = mockRepo();
  const customObjectRepo = mockRepo();
  const extensibility = { createObject: jest.fn().mockResolvedValue({ id: 'obj-1' }) };
  const webhooks = {
    createSubscription: jest.fn().mockResolvedValue({ id: 'wh-1' }),
    deleteSubscription: jest.fn().mockResolvedValue(undefined),
  };
  const service = new MarketplaceService(
    listingRepo as any, installRepo as any, extensibility as any, webhooks as any, customObjectRepo as any,
  );
  return { service, listingRepo, installRepo, customObjectRepo, extensibility, webhooks };
};

describe('MarketplaceService — publishing', () => {
  it('validates slug, semver, and manifest shape', async () => {
    const { service } = build();
    await expect(service.publish('t1', { name: 'X', slug: 'Bad Slug', version: '1.0.0', manifest: validManifest }))
      .rejects.toThrow('slug');
    await expect(service.publish('t1', { name: 'X', slug: 'good-slug', version: 'v1', manifest: validManifest }))
      .rejects.toThrow('semver');
    await expect(service.publish('t1', { name: 'X', slug: 'good-slug', version: '1.0.0', manifest: {} as any }))
      .rejects.toThrow('at least one capability');
    await expect(service.publish('t1', {
      name: 'X', slug: 'good-slug', version: '1.0.0',
      manifest: { webhooks: [{ name: 'H', targetUrl: 'http://insecure', eventTypes: ['po.approved'] }] },
    })).rejects.toThrow('https');
    await expect(service.publish('t1', {
      name: 'X', slug: 'good-slug', version: '1.0.0',
      manifest: { webhooks: [{ name: 'H', targetUrl: 'https://x', eventTypes: ['made.up.event'] }] },
    })).rejects.toThrow('unknown events');
  });

  it('publishes a new listing and version-bumps an existing one', async () => {
    const { service, listingRepo } = build();
    const listing = await service.publish('t1', {
      name: 'Retail Connector', slug: 'retail-connector', version: '1.0.0', manifest: validManifest,
    });
    expect(listing).toMatchObject({ slug: 'retail-connector', version: '1.0.0', status: ListingStatus.PUBLISHED });

    listingRepo.findOne.mockResolvedValue({
      id: 'lst-1', slug: 'retail-connector', publisherTenantId: 't1', version: '1.0.0',
      visibility: ListingVisibility.PUBLIC, category: 'general',
    });
    await expect(service.publish('t1', {
      name: 'Retail Connector', slug: 'retail-connector', version: '1.0.0', manifest: validManifest,
    })).rejects.toThrow('greater than');
    const bumped = await service.publish('t1', {
      name: 'Retail Connector', slug: 'retail-connector', version: '1.1.0', manifest: validManifest,
    });
    expect(bumped.version).toBe('1.1.0');

    listingRepo.findOne.mockResolvedValue({ id: 'lst-1', slug: 'retail-connector', publisherTenantId: 'OTHER' });
    await expect(service.publish('t1', {
      name: 'Squatter', slug: 'retail-connector', version: '9.9.9', manifest: validManifest,
    })).rejects.toThrow('already taken');
  });
});

describe('MarketplaceService — install lifecycle', () => {
  const listing = {
    id: 'lst-1', slug: 'retail-connector', name: 'Retail Connector', version: '1.0.0',
    publisherTenantId: 'publisher', visibility: ListingVisibility.PUBLIC,
    status: ListingStatus.PUBLISHED, installCount: 0, manifest: validManifest,
  };

  it('applies the manifest through platform services and records the footprint', async () => {
    const { service, listingRepo, extensibility, webhooks } = build();
    listingRepo.findOne.mockResolvedValue({ ...listing });
    const install = await service.install('t1', 'u1', 'retail-connector', { apiKey: 'k-123' });
    expect(extensibility.createObject).toHaveBeenCalledWith('t1', expect.objectContaining({ apiName: 'store' }), 'ext:retail-connector');
    expect(webhooks.createSubscription).toHaveBeenCalledWith('t1', expect.objectContaining({
      name: '[retail-connector] Notify ERP', eventTypes: ['po.approved'],
    }));
    expect(install.applied).toMatchObject({
      customObjectIds: ['obj-1'], webhookIds: ['wh-1'],
      menuItems: [{ label: 'Stores', path: 'custom/store' }],
    });
    expect(install.status).toBe(InstallStatus.INSTALLED);
    expect(listingRepo.save).toHaveBeenCalledWith(expect.objectContaining({ installCount: 1 }));
  });

  it('refuses installation without required settings; hides private listings from others', async () => {
    const { service, listingRepo } = build();
    listingRepo.findOne.mockResolvedValue({ ...listing });
    await expect(service.install('t1', 'u1', 'retail-connector', {}))
      .rejects.toThrow('"apiKey" is required');
    listingRepo.findOne.mockResolvedValue({ ...listing, visibility: ListingVisibility.PRIVATE });
    await expect(service.install('t1', 'u1', 'retail-connector', { apiKey: 'k' }))
      .rejects.toThrow('not found');
  });

  it('collects warnings instead of failing when one resource cannot be applied', async () => {
    const { service, listingRepo, extensibility } = build();
    listingRepo.findOne.mockResolvedValue({ ...listing });
    extensibility.createObject.mockRejectedValue(new Error('apiName already exists'));
    const install = await service.install('t1', 'u1', 'retail-connector', { apiKey: 'k' });
    expect(install.status).toBe(InstallStatus.INSTALLED);
    expect(install.applied!.customObjectIds).toEqual([]);
    expect(install.applied!.warnings[0]).toContain('apiName already exists');
  });

  it('uninstall removes exactly the created resources and decrements the count', async () => {
    const { service, listingRepo, installRepo, customObjectRepo, webhooks } = build();
    installRepo.findOne.mockResolvedValue({
      id: 'ins-1', tenantId: 't1', slug: 'retail-connector', listingId: 'lst-1',
      status: InstallStatus.INSTALLED,
      applied: { customObjectIds: ['obj-1'], webhookIds: ['wh-1'], menuItems: [], warnings: [] },
    });
    listingRepo.findOne.mockResolvedValue({ ...listing, installCount: 3 });
    const result = await service.uninstall('t1', 'retail-connector');
    expect(webhooks.deleteSubscription).toHaveBeenCalledWith('t1', 'wh-1');
    expect(customObjectRepo.delete).toHaveBeenCalledWith({ id: 'obj-1', tenantId: 't1' });
    expect(result.status).toBe(InstallStatus.UNINSTALLED);
    expect(listingRepo.save).toHaveBeenCalledWith(expect.objectContaining({ installCount: 2 }));

    installRepo.findOne.mockResolvedValue(null);
    await expect(service.uninstall('t1', 'ghost')).rejects.toThrow('not installed');
  });

  it('browse merges install state and hides other tenants\' private listings', async () => {
    const { service, listingRepo, installRepo } = build();
    listingRepo.find.mockResolvedValue([
      { ...listing },
      { ...listing, id: 'lst-2', slug: 'secret', visibility: ListingVisibility.PRIVATE, publisherTenantId: 'other' },
      { ...listing, id: 'lst-3', slug: 'mine-private', visibility: ListingVisibility.PRIVATE, publisherTenantId: 't1' },
    ]);
    installRepo.find.mockResolvedValue([{ slug: 'retail-connector', version: '1.0.0', status: InstallStatus.INSTALLED }]);
    const rows: any[] = await service.browse('t1');
    expect(rows.map((r) => r.slug)).toEqual(['retail-connector', 'mine-private']);
    expect(rows[0]).toMatchObject({ installed: true, installedVersion: '1.0.0' });
    expect(rows[1]).toMatchObject({ installed: false, ownListing: true });
  });

  it('menu aggregates navigation from installed extensions', async () => {
    const { service, installRepo } = build();
    installRepo.find.mockResolvedValue([
      { slug: 'a', status: InstallStatus.INSTALLED, applied: { menuItems: [{ label: 'Stores', path: 'custom/store' }] } },
      { slug: 'b', status: InstallStatus.INSTALLED, applied: { menuItems: [] } },
    ]);
    expect(await service.menu('t1')).toEqual([{ label: 'Stores', path: 'custom/store', extension: 'a' }]);
  });
});
