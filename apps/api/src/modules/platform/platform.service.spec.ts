import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { ViolationStatus } from './entities/sod-violation.entity';

/**
 * Platform governance: SoD conflict detection (with dedup), violation
 * mitigation, and the tax computation engine (rounding + expiry).
 */
describe('PlatformService', () => {
  let service: PlatformService;
  let ssoRepo: any, sodRuleRepo: any, violationRepo: any, taxRepo: any, retentionRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  beforeEach(() => {
    ssoRepo = mockRepo(); sodRuleRepo = mockRepo(); violationRepo = mockRepo();
    taxRepo = mockRepo(); retentionRepo = mockRepo();
    service = new PlatformService(ssoRepo, sodRuleRepo, violationRepo, taxRepo, retentionRepo);
  });

  // ─── Segregation of Duties ─────────────────────────────────────

  it('runSodCheck flags a user holding both conflicting permissions', async () => {
    sodRuleRepo.find.mockResolvedValue([
      { id: 'r1', permissionA: 'ap:invoices:create', permissionB: 'ap:payments:approve' },
    ]);
    const v = await service.runSodCheck('t1', 'u1', ['ap:invoices:create', 'ap:payments:approve']);
    expect(v).toHaveLength(1);
    expect(violationRepo.create).toHaveBeenCalledWith({ tenantId: 't1', ruleId: 'r1', userId: 'u1' });
  });

  it('runSodCheck passes a user holding only one side of the conflict', async () => {
    sodRuleRepo.find.mockResolvedValue([
      { id: 'r1', permissionA: 'ap:invoices:create', permissionB: 'ap:payments:approve' },
    ]);
    const v = await service.runSodCheck('t1', 'u1', ['ap:invoices:create']);
    expect(v).toHaveLength(0);
  });

  it('runSodCheck does not duplicate an already-open violation', async () => {
    sodRuleRepo.find.mockResolvedValue([
      { id: 'r1', permissionA: 'a', permissionB: 'b' },
    ]);
    violationRepo.findOne.mockResolvedValue({ id: 'existing', status: ViolationStatus.OPEN });
    const v = await service.runSodCheck('t1', 'u1', ['a', 'b']);
    expect(v).toHaveLength(0);
    expect(violationRepo.save).not.toHaveBeenCalled();
  });

  it('mitigateViolation records notes and flips the status', async () => {
    violationRepo.findOne.mockResolvedValue({ id: 'v1', tenantId: 't1', status: ViolationStatus.OPEN });
    const v = await service.mitigateViolation('t1', 'v1', 'compensating control added');
    expect(v.status).toBe(ViolationStatus.MITIGATED);
    expect(v.notes).toBe('compensating control added');
  });

  // ─── Tax engine ────────────────────────────────────────────────

  it('computeTax applies the rate with 2-decimal rounding', async () => {
    taxRepo.findOne.mockResolvedValue({ code: 'GST18', rate: 18, effectiveTo: null });
    const r = await service.computeTax('t1', { taxCode: 'GST18', amount: 999.99 } as any);
    expect(r.taxAmount).toBe(180.0);
    expect(r.total).toBeCloseTo(1179.99, 2);
  });

  it('computeTax rejects an expired tax code and 404s an unknown one', async () => {
    taxRepo.findOne.mockResolvedValue({ code: 'OLD', rate: 10, effectiveTo: '2020-01-01' });
    await expect(service.computeTax('t1', { taxCode: 'OLD', amount: 100 } as any)).rejects.toThrow(BadRequestException);

    taxRepo.findOne.mockResolvedValue(null);
    await expect(service.computeTax('t1', { taxCode: 'NOPE', amount: 100 } as any)).rejects.toThrow(NotFoundException);
  });

  // ─── SSO ───────────────────────────────────────────────────────

  it('toggleSsoProvider flips isActive and is tenant-scoped', async () => {
    ssoRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', isActive: true });
    const p = await service.toggleSsoProvider('t1', 's1');
    expect(p.isActive).toBe(false);
    expect(ssoRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', id: 's1' } });
  });
});
