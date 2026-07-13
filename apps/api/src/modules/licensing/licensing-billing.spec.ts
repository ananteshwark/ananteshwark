import { BadRequestException } from '@nestjs/common';
import { LicensingService } from './licensing.service';
import { ContractStatus, BillingCycle } from './entities/license-contract.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
});

const build = () => {
  const repos = {
    plan: mockRepo(), tier: mockRepo(), contract: mockRepo(), moduleLicense: mockRepo(),
    assignment: mockRepo(), consumption: mockRepo(), snapshot: mockRepo(),
    invoice: mockRepo(), lineItem: mockRepo(), audit: mockRepo(),
  };
  const service = new LicensingService(
    repos.plan as any, repos.tier as any, repos.contract as any, repos.moduleLicense as any,
    repos.assignment as any, repos.consumption as any, repos.snapshot as any,
    repos.invoice as any, repos.lineItem as any, repos.audit as any,
  );
  return { service, repos };
};

describe('LicensingService — module catalog validation', () => {
  it('rejects a module license for an unknown module key', async () => {
    const { service } = build();
    await expect(
      service.assignModuleLicense('t1', { contractId: 'c1', moduleKey: 'warp-drive', moduleName: 'Warp', unitPrice: 5, effectiveFrom: '2026-01-01' } as any, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a catalog module key', async () => {
    const { service } = build();
    const saved = await service.assignModuleLicense(
      't1',
      { contractId: 'c1', moduleKey: 'hr', moduleName: 'Core HR', unitPrice: 5, effectiveFrom: '2026-01-01' } as any,
      null,
    );
    expect(saved.moduleKey).toBe('hr');
  });

  it('rejects employee assignment to an unknown module key', async () => {
    const { service } = build();
    await expect(
      service.assignEmployee('t1', { employeeId: 'e1', employeeName: 'Ann', moduleKey: 'nope' } as any, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('getCatalog reports every module licensed while entitlement is unconfigured', async () => {
    const { service, repos } = build();
    repos.moduleLicense.find.mockResolvedValue([]);
    const catalog = await service.getCatalog('t1');
    expect(catalog.entitlementConfigured).toBe(false);
    expect(catalog.data.every((m) => m.licensed)).toBe(true);
  });

  it('getCatalog marks unlicensed modules once module licenses exist', async () => {
    const { service, repos } = build();
    repos.moduleLicense.find.mockResolvedValue([{ moduleKey: 'hr' }]);
    const catalog = await service.getCatalog('t1');
    expect(catalog.entitlementConfigured).toBe(true);
    const byKey = Object.fromEntries(catalog.data.map((m) => [m.key, m.licensed]));
    expect(byKey.hr).toBe(true);
    expect(byKey.finance).toBe(false);
    expect(byKey.licensing).toBe(true); // core stays available
  });
});

describe('LicensingService.billingPeriodFor', () => {
  it('MONTHLY bills the previous calendar month', () => {
    expect(LicensingService.billingPeriodFor(BillingCycle.MONTHLY, new Date('2026-07-13T00:00:00Z')))
      .toEqual({ periodStart: '2026-06-01', periodEnd: '2026-06-30', periodMonth: '2026-06' });
    // Year boundary: January bills December of the prior year.
    expect(LicensingService.billingPeriodFor(BillingCycle.MONTHLY, new Date('2026-01-05T00:00:00Z')))
      .toEqual({ periodStart: '2025-12-01', periodEnd: '2025-12-31', periodMonth: '2025-12' });
  });

  it('QUARTERLY bills only after a calendar quarter closes', () => {
    expect(LicensingService.billingPeriodFor(BillingCycle.QUARTERLY, new Date('2026-07-13T00:00:00Z')))
      .toEqual({ periodStart: '2026-04-01', periodEnd: '2026-06-30', periodMonth: '2026-06' });
    expect(LicensingService.billingPeriodFor(BillingCycle.QUARTERLY, new Date('2026-08-13T00:00:00Z'))).toBeNull();
  });

  it('ANNUAL bills only after December', () => {
    expect(LicensingService.billingPeriodFor(BillingCycle.ANNUAL, new Date('2027-01-13T00:00:00Z')))
      .toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31', periodMonth: '2026-12' });
    expect(LicensingService.billingPeriodFor(BillingCycle.ANNUAL, new Date('2026-07-13T00:00:00Z'))).toBeNull();
  });
});

describe('LicensingService.runMonthlyBillingCycle', () => {
  const asOf = new Date('2026-07-13T06:00:00Z');

  const setup = (contracts: any[]) => {
    const { service, repos } = build();
    repos.contract.find.mockResolvedValue(contracts);
    jest.spyOn(service, 'takeSnapshot').mockResolvedValue({ id: 's1' } as any);
    jest.spyOn(service, 'generateInvoice').mockImplementation(async (tenantId, dto: any) => ({
      id: `inv-${tenantId}-${dto.contractId}`,
      invoiceNumber: 'INV-2026-0001',
      totalAmount: 500,
    }) as any);
    return { service, repos };
  };

  it('snapshots each tenant and invoices monthly contracts for the closed month', async () => {
    const { service, repos } = setup([
      { id: 'c1', tenantId: 't1', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-01-01' },
      { id: 'c2', tenantId: 't2', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-01-01' },
    ]);
    const r = await service.runMonthlyBillingCycle(asOf);
    expect(r.periodMonth).toBe('2026-06');
    expect(r.tenantsProcessed).toBe(2);
    expect(r.snapshotsTaken).toBe(2);
    expect(r.invoicesGenerated).toBe(2);
    expect(service.takeSnapshot).toHaveBeenCalledWith('t1', { snapshotMonth: '2026-06' });
    expect(service.generateInvoice).toHaveBeenCalledWith(
      't1', { contractId: 'c1', periodStart: '2026-06-01', periodEnd: '2026-06-30' }, null,
    );
    expect(repos.invoice.findOne).toHaveBeenCalled();
  });

  it('is idempotent: an existing invoice for the period is skipped', async () => {
    const { service, repos } = setup([
      { id: 'c1', tenantId: 't1', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-01-01' },
    ]);
    repos.invoice.findOne.mockResolvedValue({ id: 'existing' });
    const r = await service.runMonthlyBillingCycle(asOf);
    expect(r.invoicesGenerated).toBe(0);
    expect(service.generateInvoice).not.toHaveBeenCalled();
  });

  it('skips quarterly contracts mid-quarter and contracts that started after the period', async () => {
    const { service } = setup([
      { id: 'cq', tenantId: 't1', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.QUARTERLY, contractStartDate: '2026-01-01' },
      { id: 'cn', tenantId: 't1', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-07-01' },
    ]);
    // August run: July (a mid-quarter month) closed, and cn only started in July… monthly bills July.
    const august = new Date('2026-08-10T06:00:00Z');
    const r = await service.runMonthlyBillingCycle(august);
    // Quarterly skipped (Aug run closes July, not a quarter end); monthly cn billed for July.
    expect(r.invoicesGenerated).toBe(1);
    expect(service.generateInvoice).toHaveBeenCalledWith(
      't1', { contractId: 'cn', periodStart: '2026-07-01', periodEnd: '2026-07-31' }, null,
    );

    // June-started monthly contract is not billed by a run whose period ended before it started.
    (service.generateInvoice as jest.Mock).mockClear();
    const june = new Date('2026-06-10T06:00:00Z'); // bills May; cn starts in July → skip
    const r2 = await service.runMonthlyBillingCycle(june);
    expect(r2.invoicesGenerated).toBe(0);
  });

  it('one tenant failing never stops the sweep', async () => {
    const { service } = setup([
      { id: 'c1', tenantId: 't1', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-01-01' },
      { id: 'c2', tenantId: 't2', status: ContractStatus.ACTIVE, billingCycle: BillingCycle.MONTHLY, contractStartDate: '2026-01-01' },
    ]);
    (service.generateInvoice as jest.Mock)
      .mockRejectedValueOnce(new Error('pricing misconfigured'))
      .mockResolvedValueOnce({ id: 'inv-2', invoiceNumber: 'INV-2026-0002', totalAmount: 700 } as any);
    const r = await service.runMonthlyBillingCycle(asOf);
    expect(r.invoicesGenerated).toBe(1);
    expect(r.invoices[0].tenantId).toBe('t2');
  });
});
