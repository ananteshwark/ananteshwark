import { ForbiddenException } from '@nestjs/common';
import { LicenseEnforcementService } from './license-enforcement.service';
import { LicenseEnforcementInterceptor } from './license-enforcement.interceptor';
import { ContractStatus } from './entities/license-contract.entity';
import {
  MODULE_CATALOG,
  MODULE_KEYS,
  PREFIX_TO_MODULE,
  CORE_PREFIXES,
  moduleKeyForPath,
} from './module-catalog';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('module catalog', () => {
  it('covers every module key the web licensing console offers', () => {
    const webKeys = [
      'hr', 'finance', 'payroll', 'procurement', 'inventory', 'crm', 'sales', 'contracts',
      'projects', 'expenses', 'talent', 'manufacturing', 'quality', 'maintenance', 'benefits',
      'analytics', 'platform', 'licensing',
    ];
    for (const key of webKeys) expect(MODULE_KEYS.has(key)).toBe(true);
  });

  it('maps route prefixes to their governing module', () => {
    expect(moduleKeyForPath('/hr/exits/x1')).toBe('hr');
    expect(moduleKeyForPath('/travel/requests?page=1')).toBe('expenses');
    expect(moduleKeyForPath('/recruiting/connectors')).toBe('talent');
    expect(moduleKeyForPath('/studio/integrations/jobs')).toBe('platform');
    expect(moduleKeyForPath('/auth/login')).toBeNull(); // core, unmapped
    expect(moduleKeyForPath('/licensing/contracts')).toBeNull();
  });

  it('keeps core prefixes and licensable prefixes disjoint', () => {
    for (const prefix of Object.keys(PREFIX_TO_MODULE)) {
      expect(CORE_PREFIXES.has(prefix)).toBe(false);
    }
  });

  it('every catalog entry is well-formed', () => {
    for (const m of MODULE_CATALOG) {
      expect(m.key).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(Array.isArray(m.routePrefixes)).toBe(true);
    }
  });
});

describe('LicenseEnforcementService', () => {
  let service: LicenseEnforcementService;
  let contractRepo: any, moduleLicenseRepo: any;
  const asOf = new Date('2026-07-13T12:00:00Z');

  beforeEach(() => {
    contractRepo = mockRepo();
    moduleLicenseRepo = mockRepo();
    service = new LicenseEnforcementService(contractRepo, moduleLicenseRepo);
  });

  it('always allows core routes without touching the repos', async () => {
    const d = await service.checkRequest('t1', '/auth/login', asOf);
    expect(d).toEqual({ allowed: true });
    expect(contractRepo.find).not.toHaveBeenCalled();
  });

  it('allows everything when no contracts exist (licensing not configured)', async () => {
    const d = await service.checkRequest('t1', '/hr/employees', asOf);
    expect(d.allowed).toBe(true);
  });

  it('allows a tenant with a valid ACTIVE contract, no warning', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.ACTIVE, contractEndDate: '2026-12-31', gracePeriodDays: 5 },
    ]);
    const d = await service.checkRequest('t1', '/finance/ledgers', asOf);
    expect(d).toEqual({ allowed: true, warning: undefined });
  });

  it('warns during the grace period after contract expiry', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.ACTIVE, contractEndDate: '2026-07-10', gracePeriodDays: 5 },
    ]);
    const d = await service.checkRequest('t1', '/finance/ledgers', asOf);
    expect(d.allowed).toBe(true);
    expect(d.warning).toMatch(/grace period until 2026-07-15/);
  });

  it('blocks once the grace period has ended', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.ACTIVE, contractEndDate: '2026-07-01', gracePeriodDays: 5 },
    ]);
    const d = await service.checkRequest('t1', '/finance/ledgers', asOf);
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/No active license contract/);
  });

  it('allows a trial tenant with a warning', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.TRIAL, contractEndDate: '2026-08-01', gracePeriodDays: 5 },
    ]);
    const d = await service.checkRequest('t1', '/hr/employees', asOf);
    expect(d.allowed).toBe(true);
    expect(d.warning).toMatch(/trial/i);
  });

  it('blocks tenants whose only contracts are cancelled or expired', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.CANCELLED, contractEndDate: '2026-01-01', gracePeriodDays: 5 },
    ]);
    const d = await service.checkRequest('t1', '/hr/employees', asOf);
    expect(d.allowed).toBe(false);
  });

  describe('module coverage (only once module licenses are configured)', () => {
    beforeEach(() => {
      contractRepo.find.mockResolvedValue([
        { status: ContractStatus.ACTIVE, contractEndDate: '2026-12-31', gracePeriodDays: 5 },
      ]);
    });

    it('blocks a module not covered by any active module license', async () => {
      moduleLicenseRepo.find.mockResolvedValue([{ moduleKey: 'hr' }]);
      const d = await service.checkRequest('t1', '/finance/ledgers', asOf);
      expect(d.allowed).toBe(false);
      expect(d.reason).toMatch(/'finance' is not licensed/);
    });

    it('allows a covered module and unmapped prefixes', async () => {
      moduleLicenseRepo.find.mockResolvedValue([{ moduleKey: 'hr' }]);
      expect((await service.checkRequest('t1', '/hr/leave', asOf)).allowed).toBe(true);
      // Unmapped, non-core prefix: contract check only.
      expect((await service.checkRequest('t1', '/some-future-area/x', asOf)).allowed).toBe(true);
    });

    it('skips module checks entirely when no module licenses exist', async () => {
      moduleLicenseRepo.find.mockResolvedValue([]);
      const d = await service.checkRequest('t1', '/finance/ledgers', asOf);
      expect(d.allowed).toBe(true);
    });
  });

  it('caches per tenant and re-reads after invalidate()', async () => {
    contractRepo.find.mockResolvedValue([
      { status: ContractStatus.ACTIVE, contractEndDate: '2026-12-31', gracePeriodDays: 5 },
    ]);
    await service.checkRequest('t1', '/hr/employees', asOf);
    await service.checkRequest('t1', '/finance/ledgers', asOf);
    expect(contractRepo.find).toHaveBeenCalledTimes(1);

    service.invalidate('t1');
    await service.checkRequest('t1', '/hr/employees', asOf);
    expect(contractRepo.find).toHaveBeenCalledTimes(2);
  });
});

describe('LicenseEnforcementInterceptor', () => {
  const next = { handle: jest.fn(() => 'handled' as any) };

  const httpContext = (request: any, response: any = {}) =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    }) as any;

  beforeEach(() => next.handle.mockClear());

  it('passes unauthenticated requests through without checking', async () => {
    const enforcement: any = { checkRequest: jest.fn() };
    const interceptor = new LicenseEnforcementInterceptor(enforcement);
    await interceptor.intercept(httpContext({ path: '/auth/login' }), next as any);
    expect(enforcement.checkRequest).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it('throws ForbiddenException on a blocked decision', async () => {
    const enforcement: any = {
      checkRequest: jest.fn().mockResolvedValue({ allowed: false, reason: 'No active license contract' }),
    };
    const interceptor = new LicenseEnforcementInterceptor(enforcement);
    await expect(
      interceptor.intercept(httpContext({ path: '/hr/employees', user: { tenantId: 't1' } }), next as any),
    ).rejects.toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('surfaces a degraded-but-allowed decision as a warning header', async () => {
    const enforcement: any = {
      checkRequest: jest.fn().mockResolvedValue({ allowed: true, warning: 'in grace period' }),
    };
    const response = { setHeader: jest.fn() };
    const interceptor = new LicenseEnforcementInterceptor(enforcement);
    await interceptor.intercept(
      httpContext({ path: '/hr/employees', user: { tenantId: 't1' } }, response),
      next as any,
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-License-Warning', 'in grace period');
    expect(next.handle).toHaveBeenCalled();
  });
});
