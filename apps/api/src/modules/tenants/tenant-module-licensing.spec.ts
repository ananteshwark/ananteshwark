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

  describe('getModuleConfig — default active + tenant toggles', () => {
    it('defaults every licensed module to active when never customized', async () => {
      const { svc } = buildService(['hr', 'finance', 'payroll'], { id: 't1', settings: {} });
      const cfg = await svc.getModuleConfig('t1');
      expect(cfg.licensedModules).toEqual(['hr', 'finance', 'payroll']);
      expect(cfg.enabledModules).toEqual(['hr', 'finance', 'payroll']);
    });

    it('honors the tenant admin turning a module off', async () => {
      const { svc } = buildService(['hr', 'finance', 'payroll'], { id: 't1', settings: { enabledModules: ['hr', 'payroll'] } });
      const cfg = await svc.getModuleConfig('t1');
      expect(cfg.enabledModules).toEqual(['hr', 'payroll']);
    });

    it('drops stored modules no longer covered by the license', async () => {
      const { svc } = buildService(['hr'], { id: 't1', settings: { enabledModules: ['hr', 'sales'] } });
      const cfg = await svc.getModuleConfig('t1');
      expect(cfg.enabledModules).toEqual(['hr']); // sales filtered out
    });

    it('reports nothing active when no license is allocated', async () => {
      const { svc } = buildService(null, { id: 't1', settings: {} });
      const cfg = await svc.getModuleConfig('t1');
      expect(cfg.licensedModules).toEqual([]);
      expect(cfg.enabledModules).toEqual([]);
    });
  });

  describe('setEnabledModules', () => {
    it('persists an active subset and returns the fresh config', async () => {
      const { svc, tenantRepo } = buildService(['hr', 'finance'], { id: 't1', settings: {} });
      // save reflects the new settings back for the follow-up getModuleConfig read
      tenantRepo.save.mockImplementation((x: any) => Promise.resolve(x));
      tenantRepo.findOne.mockImplementation(() => Promise.resolve({ id: 't1', settings: { enabledModules: ['hr'] } }));
      const cfg = await svc.setEnabledModules('t1', ['hr']);
      expect(cfg.enabledModules).toEqual(['hr']);
    });

    it('rejects an active subset containing an unlicensed module', async () => {
      const { svc } = buildService(['hr'], { id: 't1', settings: {} });
      await expect(svc.setEnabledModules('t1', ['hr', 'sales'])).rejects.toThrow(BadRequestException);
    });
  });
});
