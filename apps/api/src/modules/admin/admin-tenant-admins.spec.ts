import { AdminService } from './admin.service';

/**
 * Guards the "surface Tenant Admin details on the tenant-management page" feature:
 * listTenants / getTenant must enrich each tenant with the user(s) holding the
 * "Tenant Admin" role, projected to a secrets-free summary, without leaking
 * cross-tenant admins.
 */
describe('AdminService — tenant admin enrichment', () => {
  const makeQB = (rows: any[]) => {
    const qb: any = {
      innerJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      getMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  const buildService = (opts: {
    tenants: any[];
    licenses?: any[];
    users?: any[];
    adminRows?: any[];
  }) => {
    const tenantRepo: any = {
      find: jest.fn().mockResolvedValue(opts.tenants),
      findOne: jest.fn().mockResolvedValue(opts.tenants[0] ?? null),
    };
    const licenseRepo: any = { find: jest.fn().mockResolvedValue(opts.licenses ?? []), findOne: jest.fn().mockResolvedValue(opts.licenses?.[0] ?? null) };
    const userRepo: any = { find: jest.fn().mockResolvedValue(opts.users ?? []), count: jest.fn().mockResolvedValue((opts.users ?? []).length) };
    const userRoleRepo: any = { createQueryBuilder: jest.fn(() => makeQB(opts.adminRows ?? [])) };
    return new AdminService(tenantRepo, userRepo, licenseRepo, userRoleRepo, {} as any, {} as any, {} as any);
  };

  const adminUser = {
    id: 'u1', email: 'admin@acme.com', firstName: 'Ada', lastName: 'Lovelace',
    phone: '555', status: 'active', lastLoginAt: null, passwordHash: 'SECRET',
  };

  it('listTenants attaches primaryAdmin + admins and never leaks the password hash', async () => {
    const svc = buildService({
      tenants: [{ id: 't1', name: 'Acme' }],
      adminRows: [{ tenantId: 't1', userId: 'u1', user: adminUser, role: { name: 'Tenant Admin' } }],
    });
    const [row] = await svc.listTenants();
    expect(row.primaryAdmin).toMatchObject({ email: 'admin@acme.com', fullName: 'Ada Lovelace', status: 'active' });
    expect(row.admins).toHaveLength(1);
    expect((row.primaryAdmin as any).passwordHash).toBeUndefined();
  });

  it('listTenants reports primaryAdmin=null when no admin is assigned', async () => {
    const svc = buildService({ tenants: [{ id: 't1', name: 'Acme' }], adminRows: [] });
    const [row] = await svc.listTenants();
    expect(row.primaryAdmin).toBeNull();
    expect(row.admins).toEqual([]);
  });

  it('de-duplicates the same admin appearing on multiple role rows', async () => {
    const svc = buildService({
      tenants: [{ id: 't1', name: 'Acme' }],
      adminRows: [
        { tenantId: 't1', userId: 'u1', user: adminUser, role: { name: 'Tenant Admin' } },
        { tenantId: 't1', userId: 'u1', user: adminUser, role: { name: 'Tenant Admin' } },
      ],
    });
    const [row] = await svc.listTenants();
    expect(row.admins).toHaveLength(1);
  });

  it('getTenant enriches a single tenant with its admins', async () => {
    const svc = buildService({
      tenants: [{ id: 't1', name: 'Acme' }],
      adminRows: [{ tenantId: 't1', userId: 'u1', user: adminUser, role: { name: 'Tenant Admin' } }],
    });
    const t = await svc.getTenant('t1');
    expect(t.primaryAdmin.email).toBe('admin@acme.com');
    expect(t.admins).toHaveLength(1);
  });
});
