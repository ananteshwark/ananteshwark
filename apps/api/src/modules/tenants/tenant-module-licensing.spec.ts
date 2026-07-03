import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

/**
 * Enforces "a tenant admin can only enable modules assigned by the super admin":
 * updateSettings must clamp enabledModules to the license's enabledModules and
 * reject anything beyond it. getLicensedModules is the authoritative source.
 */
describe('TenantsService — module licensing ceiling', () => {
  const buildService = (license: string[] | null, tenant: any = { id: 't1', settings: {} }) => {
    const tenantRepo: any = {
      findOne: jest.fn().mockResolvedValue(tenant),
      save: jest.fn((x) => Promise.resolve(x)),
    };
    const licenseRepo: any = {
      findOne: jest.fn().mockResolvedValue(license ? { tenantId: 't1', enabledModules: license } : null),
    };
    return { svc: new TenantsService(tenantRepo, licenseRepo), tenantRepo };
  };

  it('getLicensedModules returns the license modules', async () => {
    const { svc } = buildService(['hr', 'finance']);
    expect(await svc.getLicensedModules('t1')).toEqual(['hr', 'finance']);
  });

  it('getLicensedModules returns [] when no license is allocated', async () => {
    const { svc } = buildService(null);
    expect(await svc.getLicensedModules('t1')).toEqual([]);
  });

  it('allows enabling modules within the license', async () => {
    const { svc, tenantRepo } = buildService(['hr', 'finance', 'payroll']);
    await svc.updateSettings('t1', { enabledModules: ['hr', 'finance'] } as any);
    expect(tenantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ enabledModules: ['hr', 'finance'] }) }),
    );
  });

  it('rejects enabling a module not on the license', async () => {
    const { svc, tenantRepo } = buildService(['hr', 'finance']);
    await expect(
      svc.updateSettings('t1', { enabledModules: ['hr', 'sales'] } as any),
    ).rejects.toThrow(BadRequestException);
    expect(tenantRepo.save).not.toHaveBeenCalled();
  });

  it('rejects any module when no license is allocated', async () => {
    const { svc } = buildService(null);
    await expect(
      svc.updateSettings('t1', { enabledModules: ['hr'] } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('leaves non-module settings (locale, timezone) unrestricted', async () => {
    const { svc, tenantRepo } = buildService(['hr']);
    await svc.updateSettings('t1', { locale: 'fr', timezone: 'Europe/Paris' } as any);
    expect(tenantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ locale: 'fr', timezone: 'Europe/Paris' }) }),
    );
  });
});
