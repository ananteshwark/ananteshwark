import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RebateService } from './rebate.service';
import { RebateStatus, RebateCalculationBasis } from './entities/rebate-agreement.entity';

/**
 * Rebates: tier matching on order value ([from, to) with open-ended top
 * tier), accrual only inside the validity window for the order's customer,
 * and settlement of the pending accrued amount exactly once.
 */
describe('RebateService', () => {
  let service: RebateService;
  let rebateRepo: any, orderRepo: any, sequence: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  const agreement = (over: any = {}) => ({
    id: 'ag1', tenantId: 't1', customerId: 'c1', status: RebateStatus.ACTIVE,
    calculationBasis: RebateCalculationBasis.REVENUE,
    validFrom: '2026-01-01', validTo: '2026-12-31',
    accruedAmount: 0, settledAmount: 0,
    tiers: [
      { from: 0, to: 1000, rebatePct: 1 },
      { from: 1000, to: 5000, rebatePct: 2 },
      { from: 5000, to: null, rebatePct: 3 }, // open-ended
    ],
    ...over,
  });

  beforeEach(() => {
    rebateRepo = mockRepo(); orderRepo = mockRepo();
    sequence = { formatted: jest.fn().mockResolvedValue('REB-00001'), next: jest.fn() };
    service = new RebateService(rebateRepo, orderRepo, sequence);
  });

  it('simulateRebate picks the tier containing the order value', async () => {
    rebateRepo.findOne.mockResolvedValue(agreement());
    expect((await service.simulateRebate('t1', 'ag1', 500)).rebateAmount).toBe(5);      // 1%
    expect((await service.simulateRebate('t1', 'ag1', 2000)).rebateAmount).toBe(40);    // 2%
    expect((await service.simulateRebate('t1', 'ag1', 10000)).rebateAmount).toBe(300);  // 3% open-ended
  });

  it('tier boundaries are [from, to): exactly 1000 lands in the second tier', async () => {
    rebateRepo.findOne.mockResolvedValue(agreement());
    const r = await service.simulateRebate('t1', 'ag1', 1000);
    expect(r.tier.rebatePct).toBe(2);
    expect(r.rebateAmount).toBe(20);
  });

  it('accrueRebate accrues for in-window agreements of the order customer', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', customerId: 'c1', total: 2000 });
    const ag = agreement();
    rebateRepo.find.mockResolvedValue([ag]);
    const results = await service.accrueRebate('t1', 'so1');
    expect(results).toHaveLength(1);
    expect(results[0].rebateAmount).toBe(40);
    expect(ag.accruedAmount).toBe(40);
  });

  it('accrueRebate skips agreements outside their validity window', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', customerId: 'c1', total: 2000 });
    rebateRepo.find.mockResolvedValue([agreement({ validTo: '2025-12-31' })]);
    expect(await service.accrueRebate('t1', 'so1')).toHaveLength(0);
  });

  it('settleAgreement pays out the pending accrual once and flips to SETTLED', async () => {
    const ag = agreement({ accruedAmount: 500, settledAmount: 100 });
    rebateRepo.findOne.mockResolvedValue(ag);
    const settled = await service.settleAgreement('t1', 'ag1');
    expect(settled.settledAmount).toBe(500);
    expect(settled.status).toBe(RebateStatus.SETTLED);

    // nothing pending → reject
    rebateRepo.findOne.mockResolvedValue(agreement({ accruedAmount: 100, settledAmount: 100 }));
    await expect(service.settleAgreement('t1', 'ag1')).rejects.toThrow('No accrued amount');

    // non-active → reject
    rebateRepo.findOne.mockResolvedValue(agreement({ status: RebateStatus.SETTLED, accruedAmount: 10 }));
    await expect(service.settleAgreement('t1', 'ag1')).rejects.toThrow(BadRequestException);
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.getAgreement('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(rebateRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
