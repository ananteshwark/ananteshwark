import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

/**
 * Covers super-admin tenant management added for the tenant page:
 *  - hide / unhide a tenant (soft archive) and list filtering
 *  - add a new tenant admin to an existing tenant
 *  - edit a tenant admin (name / phone / password) without leaking secrets
 */
describe('AdminService — tenant management', () => {
  const makeTenant = (over: any = {}) => ({ id: 't1', name: 'Acme', settings: {}, hidden: false, ...over });

  const build = (opts: {
    tenant?: any;
    emailTaken?: any;
    adminUser?: any;
    roles?: any[];
    userRow?: any;
  } = {}) => {
    const tenantRepo: any = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(opts.tenant ?? makeTenant()),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    const userRepo: any = {
      findOne: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    const licenseRepo: any = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const userRoleRepo: any = { createQueryBuilder: jest.fn() };
    const usersService: any = { create: jest.fn().mockResolvedValue(opts.adminUser ?? { id: 'u9', email: 'new@acme.com', firstName: 'New', lastName: 'Admin', passwordHash: 'SECRET' }) };
    const rbacService: any = {
      seedSystemRoles: jest.fn().mockResolvedValue(undefined),
      findAll: jest.fn().mockResolvedValue(opts.roles ?? [{ id: 'r-admin', name: 'Tenant Admin' }]),
    };
    const permissionsService: any = { assignRole: jest.fn().mockResolvedValue(undefined) };
    const svc = new AdminService(tenantRepo, userRepo, licenseRepo, userRoleRepo, usersService, rbacService, permissionsService);
    return { svc, tenantRepo, userRepo, usersService, rbacService, permissionsService };
  };

  // ---- hide / unhide ----
  it('setTenantHidden hides a tenant', async () => {
    const { svc, tenantRepo } = build({ tenant: makeTenant() });
    const t = await svc.setTenantHidden('t1', true);
    expect(t.hidden).toBe(true);
    expect(tenantRepo.save).toHaveBeenCalled();
  });

  it('setTenantHidden throws for a missing tenant', async () => {
    const { svc, tenantRepo } = build();
    tenantRepo.findOne.mockResolvedValue(null);
    await expect(svc.setTenantHidden('nope', true)).rejects.toThrow(NotFoundException);
  });

  it('listTenants excludes hidden by default, includes them when asked', async () => {
    const { svc, tenantRepo } = build();
    await svc.listTenants(false);
    expect(tenantRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { hidden: false } }));
    await svc.listTenants(true);
    expect(tenantRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  // ---- add tenant admin ----
  it('addTenantAdmin creates the user, grants the Tenant Admin role, and hides the hash', async () => {
    const { svc, usersService, permissionsService } = build();
    const res = await svc.addTenantAdmin('t1', { email: 'new@acme.com', firstName: 'New', lastName: 'Admin', password: 'password123' });
    expect(usersService.create).toHaveBeenCalledWith('t1', expect.objectContaining({ email: 'new@acme.com' }));
    expect(permissionsService.assignRole).toHaveBeenCalledWith('u9', 'r-admin', 't1', 'u9');
    expect(res.email).toBe('new@acme.com');
    expect(res.passwordHash).toBeUndefined();
  });

  it('addTenantAdmin rejects a globally-taken email', async () => {
    const { svc, userRepo } = build();
    userRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      svc.addTenantAdmin('t1', { email: 'dupe@acme.com', firstName: 'A', lastName: 'B', password: 'password123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('addTenantAdmin throws when the tenant does not exist', async () => {
    const { svc, tenantRepo } = build();
    tenantRepo.findOne.mockResolvedValue(null);
    await expect(
      svc.addTenantAdmin('nope', { email: 'a@b.com', firstName: 'A', lastName: 'B', password: 'password123' }),
    ).rejects.toThrow(NotFoundException);
  });

  // ---- edit tenant admin ----
  it('updateTenantAdmin updates name/phone and hashes a new password', async () => {
    const { svc, userRepo } = build();
    userRepo.findOne.mockResolvedValue({ id: 'u1', tenantId: 't1', firstName: 'Old', lastName: 'Name', phone: null, passwordHash: 'OLD', email: 'a@acme.com' });
    const res = await svc.updateTenantAdmin('t1', 'u1', { firstName: 'Ada', phone: '555', password: 'newpassword1' });
    const saved = userRepo.save.mock.calls[0][0];
    expect(saved.firstName).toBe('Ada');
    expect(saved.phone).toBe('555');
    expect(saved.passwordHash).not.toBe('OLD'); // re-hashed
    expect(res.passwordHash).toBeUndefined(); // summary hides the hash
  });

  it('updateTenantAdmin throws when the admin is not in the tenant', async () => {
    const { svc, userRepo } = build();
    userRepo.findOne.mockResolvedValue(null);
    await expect(svc.updateTenantAdmin('t1', 'ghost', { firstName: 'X' })).rejects.toThrow(NotFoundException);
  });
});
