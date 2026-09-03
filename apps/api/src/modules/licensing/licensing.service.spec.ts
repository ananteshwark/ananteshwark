import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LicensingService } from './licensing.service';
import { LicenseType } from './entities/license-plan.entity';
import { ContractStatus } from './entities/license-contract.entity';
import { ConsumptionType } from './entities/consumption-record.entity';
import { PricingTier } from './entities/pricing-tier.entity';

/**
 * Core licensing enforcement: per-module seat caps on assignment (single +
 * bulk), tiered pricing math, the validateAccess gate (contract lifecycle,
 * module licensing, seats, consumption pool), and pool decrement.
 */
describe('LicensingService', () => {
  let service: LicensingService;
  let planRepo: any, tierRepo: any, contractRepo: any, moduleLicenseRepo: any,
    assignmentRepo: any, consumptionRepo: any, snapshotRepo: any,
    invoiceRepo: any, lineItemRepo: any, auditLogRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: x?.id ?? 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    planRepo = mockRepo(); tierRepo = mockRepo(); contractRepo = mockRepo();
    moduleLicenseRepo = mockRepo(); assignmentRepo = mockRepo(); consumptionRepo = mockRepo();
    snapshotRepo = mockRepo(); invoiceRepo = mockRepo(); lineItemRepo = mockRepo(); auditLogRepo = mockRepo();
    service = new LicensingService(
      planRepo, tierRepo, contractRepo, moduleLicenseRepo, assignmentRepo,
      consumptionRepo, snapshotRepo, invoiceRepo, lineItemRepo, auditLogRepo,
    );
  });

  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // ─── Seat-cap enforcement ───────────────────────────────────────

  it('assignEmployee rejects a duplicate active assignment', async () => {
    assignmentRepo.findOne.mockResolvedValue({ id: 'a1' });
    await expect(
      service.assignEmployee('t1', { employeeId: 'e1', employeeName: 'E', moduleKey: 'hr' } as any, 'u1'),
    ).rejects.toThrow(ConflictException);
  });

  it('assignEmployee blocks when the module seat cap is reached', async () => {
    assignmentRepo.findOne.mockResolvedValue(null);
    moduleLicenseRepo.find.mockResolvedValue([{ maxEmployees: 5, isActive: true }]);
    assignmentRepo.count.mockResolvedValue(5);
    await expect(
      service.assignEmployee('t1', { employeeId: 'e1', employeeName: 'E', moduleKey: 'hr' } as any, 'u1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('assignEmployee succeeds under the cap and writes an audit log', async () => {
    assignmentRepo.findOne.mockResolvedValue(null);
    moduleLicenseRepo.find.mockResolvedValue([{ maxEmployees: 5, isActive: true }]);
    assignmentRepo.count.mockResolvedValue(4);
    const a = await service.assignEmployee('t1', { employeeId: 'e1', employeeName: 'E', moduleKey: 'hr' } as any, 'u1');
    expect(a.isActive).toBe(true);
    expect(auditLogRepo.save).toHaveBeenCalled();
  });

  it('an unlimited module license lifts the cap entirely', async () => {
    assignmentRepo.findOne.mockResolvedValue(null);
    moduleLicenseRepo.find.mockResolvedValue([{ maxEmployees: 5 }, { maxEmployees: null }]);
    assignmentRepo.count.mockResolvedValue(999);
    const a = await service.assignEmployee('t1', { employeeId: 'e1', employeeName: 'E', moduleKey: 'hr' } as any, 'u1');
    expect(a.isActive).toBe(true);
  });

  it('bulkAssignEmployees skips duplicates and stops at the cap', async () => {
    moduleLicenseRepo.find.mockResolvedValue([{ maxEmployees: 3, isActive: true }]);
    assignmentRepo.count.mockResolvedValue(2); // one seat left
    // e1 already assigned; e2, e3 are new
    assignmentRepo.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve(where.employeeId === 'e1' ? { id: 'a1' } : null));
    const res = await service.bulkAssignEmployees('t1', {
      moduleKey: 'hr',
      employeeIds: [
        { employeeId: 'e1', employeeName: 'A' },
        { employeeId: 'e2', employeeName: 'B' },
        { employeeId: 'e3', employeeName: 'C' },
      ],
    } as any, 'u1');
    expect(res).toEqual({ assigned: 1, skipped: 1, capReached: 1 });
  });

  it('revokeAssignment deactivates and stamps revokedAt', async () => {
    assignmentRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', isActive: true });
    const a = await service.revokeAssignment('t1', 'a1', 'u1');
    expect(a.isActive).toBe(false);
    expect(a.revokedAt).toBeInstanceOf(Date);
  });

  // ─── Tiered pricing ─────────────────────────────────────────────

  it('applyTieredPricing charges each band at its own rate', () => {
    const tiers = [
      { minUnits: 1, maxUnits: 10, unitPrice: 10, flatFee: 0 },
      { minUnits: 11, maxUnits: null, unitPrice: 8, flatFee: 0 },
    ] as PricingTier[];
    // 10 * 10 + 5 * 8 = 140
    expect(service.applyTieredPricing(15, tiers)).toBe(140);
  });

  it('applyTieredPricing adds flat fees and handles quantities inside one band', () => {
    const tiers = [
      { minUnits: 1, maxUnits: 10, unitPrice: 10, flatFee: 50 },
      { minUnits: 11, maxUnits: null, unitPrice: 8, flatFee: 100 },
    ] as PricingTier[];
    expect(service.applyTieredPricing(5, tiers)).toBe(50 + 5 * 10);
  });

  // ─── validateAccess gate ────────────────────────────────────────

  it('hard-blocks when there is no contract at all', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    const r = await service.validateAccess('t1', {} as any);
    expect(r).toMatchObject({ allowed: false, action: 'HARD_BLOCK' });
  });

  it('allows (WARN) on a trial contract', async () => {
    contractRepo.findOne
      .mockResolvedValueOnce(null) // no ACTIVE
      .mockResolvedValueOnce({ status: ContractStatus.TRIAL }); // TRIAL exists
    const r = await service.validateAccess('t1', {} as any);
    expect(r).toMatchObject({ allowed: true, action: 'WARN' });
  });

  it('allows (WARN) inside the post-expiry grace period, hard-blocks after it', async () => {
    contractRepo.findOne.mockResolvedValue({
      status: ContractStatus.ACTIVE, contractEndDate: daysFromNow(-2), gracePeriodDays: 5,
    });
    expect(await service.validateAccess('t1', {} as any)).toMatchObject({ allowed: true, action: 'WARN' });

    contractRepo.findOne.mockResolvedValue({
      status: ContractStatus.ACTIVE, contractEndDate: daysFromNow(-30), gracePeriodDays: 5,
    });
    expect(await service.validateAccess('t1', {} as any)).toMatchObject({ allowed: false, action: 'HARD_BLOCK' });
  });

  it('soft-blocks an unlicensed module and an unassigned employee', async () => {
    contractRepo.findOne.mockResolvedValue({ status: ContractStatus.ACTIVE, contractEndDate: daysFromNow(30) });
    moduleLicenseRepo.findOne.mockResolvedValue(null);
    expect(await service.validateAccess('t1', { moduleKey: 'payroll' } as any))
      .toMatchObject({ allowed: false, action: 'SOFT_BLOCK' });

    moduleLicenseRepo.findOne.mockResolvedValue({ isActive: true });
    assignmentRepo.findOne.mockResolvedValue(null);
    expect(await service.validateAccess('t1', { moduleKey: 'payroll', employeeId: 'e1' } as any))
      .toMatchObject({ allowed: false, action: 'SOFT_BLOCK' });
  });

  it('enterprise: soft-blocks an exhausted pool, warns when low', async () => {
    const base = {
      status: ContractStatus.ACTIVE, contractEndDate: daysFromNow(30),
      licenseType: LicenseType.ENTERPRISE_CONSUMPTION, consumptionPoolUnits: 1000, graceThresholdPct: 5,
    };
    contractRepo.findOne.mockResolvedValue({ ...base, remainingUnits: 0 });
    expect(await service.validateAccess('t1', {} as any)).toMatchObject({ allowed: false, action: 'SOFT_BLOCK' });

    contractRepo.findOne.mockResolvedValue({ ...base, remainingUnits: 30 }); // <= 5% of 1000
    expect(await service.validateAccess('t1', {} as any)).toMatchObject({ allowed: true, action: 'WARN' });

    contractRepo.findOne.mockResolvedValue({ ...base, remainingUnits: 900 });
    expect(await service.validateAccess('t1', {} as any)).toMatchObject({ allowed: true, action: 'ALLOW' });
  });

  // ─── Consumption pool ───────────────────────────────────────────

  it('recordConsumption computes cost and decrements the enterprise pool (floored at 0)', async () => {
    contractRepo.find.mockResolvedValue([{ remainingUnits: 40 }, { remainingUnits: 10 }]);
    const rec = await service.recordConsumption('t1', {
      periodMonth: '2026-07', consumptionType: ConsumptionType.EMPLOYEE,
      activeEmployees: 10, unitsConsumed: 25, unitRate: 2,
    } as any);
    expect(rec.totalCost).toBe(50);
    const saved = contractRepo.save.mock.calls.map((c: any[]) => c[0].remainingUnits);
    expect(saved).toEqual([15, 0]); // 40-25, max(0, 10-25)
  });

  // ─── Contracts ──────────────────────────────────────────────────

  it('createContract auto-numbers LIC-<year>-NNNN and starts in TRIAL', async () => {
    contractRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxNum: '7' }),
    });
    const c = await service.createContract('t1', {
      licenseType: LicenseType.EMPLOYEE_BASED, billingCycle: 'MONTHLY',
      contractStartDate: '2026-01-01', contractEndDate: '2026-12-31',
    } as any, 'u1');
    expect(c.contractNumber).toBe(`LIC-${new Date().getFullYear()}-0008`);
    expect(c.status).toBe(ContractStatus.TRIAL);
  });

  it('getContract is tenant-scoped and 404s when missing', async () => {
    contractRepo.findOne.mockResolvedValue(null);
    await expect(service.getContract('t1', 'x')).rejects.toThrow(NotFoundException);
    expect(contractRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't1' } });
  });

  it('updateContractStatus persists the transition and audits old/new', async () => {
    contractRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ContractStatus.TRIAL });
    const c = await service.updateContractStatus('t1', 'c1', { status: ContractStatus.ACTIVE } as any, 'u1');
    expect(c.status).toBe(ContractStatus.ACTIVE);
    expect(auditLogRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'CONTRACT_STATUS_UPDATED',
      oldValue: { status: ContractStatus.TRIAL },
      newValue: { status: ContractStatus.ACTIVE },
    }));
  });
});
