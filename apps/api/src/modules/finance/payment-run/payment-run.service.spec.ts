import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentRunService } from './payment-run.service';
import { PaymentRunStatus } from './entities/payment-run.entity';

/**
 * Payment runs: the proposal picks due open bills but excludes held ones,
 * totals track only included items and unique vendors, item toggling is
 * PROPOSED-only, and the PROPOSED → APPROVED → posted lifecycle is guarded.
 */
describe('PaymentRunService', () => {
  let service: PaymentRunService;
  let runRepo: any, itemRepo: any, billRepo: any, vendorRepo: any;
  let apService: any, cashDiscountService: any, apHoldService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x.map((e, i) => ({ id: `it-${i}`, ...e })) : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    runRepo = mockRepo(); itemRepo = mockRepo(); billRepo = mockRepo(); vendorRepo = mockRepo();
    apService = { createPayment: jest.fn().mockResolvedValue({ id: 'pay-1' }) };
    cashDiscountService = { findByCode: jest.fn().mockResolvedValue(null), computeForTerm: jest.fn() };
    apHoldService = { getHeldBillIds: jest.fn().mockResolvedValue(new Set()) };
    service = new PaymentRunService(
      runRepo, itemRepo, billRepo, vendorRepo, apService, cashDiscountService, apHoldService,
    );
  });

  const dueBills = (bills: any[]) => {
    billRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(bills),
    });
  };

  it('createProposal validates required inputs', async () => {
    await expect(service.createProposal('t1', { dueByDate: '', paymentMethod: 'ACH' } as any)).rejects.toThrow('dueByDate');
    await expect(service.createProposal('t1', { dueByDate: '2026-07-31', paymentMethod: '' } as any)).rejects.toThrow('paymentMethod');
  });

  it('createProposal proposes due open bills but excludes bills on hold', async () => {
    dueBills([
      { id: 'b1', vendorId: 'v1', billNumber: 'B-1', balanceDue: 100 },
      { id: 'b2', vendorId: 'v2', billNumber: 'B-2', balanceDue: 200 }, // held
    ]);
    apHoldService.getHeldBillIds.mockResolvedValue(new Set(['b2']));
    vendorRepo.find.mockResolvedValue([{ id: 'v1', name: 'Acme' }]);
    itemRepo.find.mockResolvedValue([{ vendorId: 'v1', amount: 100, included: true }]);
    runRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });

    const { items } = await service.createProposal('t1', { dueByDate: '2026-07-31', paymentMethod: 'ACH' } as any);
    expect(items).toHaveLength(1);
    expect(itemRepo.create).toHaveBeenCalledTimes(1);
    expect(itemRepo.create).toHaveBeenCalledWith(expect.objectContaining({ billId: 'b1', vendorName: 'Acme', included: true }));
  });

  it('totals count only included items and unique vendors', async () => {
    dueBills([]);
    vendorRepo.find.mockResolvedValue([]);
    itemRepo.find.mockResolvedValue([
      { vendorId: 'v1', amount: 100, included: true },
      { vendorId: 'v1', amount: 50, included: true },
      { vendorId: 'v2', amount: 999, included: false }, // excluded
    ]);
    runRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });
    await service.createProposal('t1', { dueByDate: '2026-07-31', paymentMethod: 'ACH' } as any);
    expect(runRepo.update).toHaveBeenCalledWith(
      { id: 'gen-1', tenantId: 't1' },
      { totalAmount: 150, vendorCount: 1 },
    );
  });

  it('toggleItem only works on PROPOSED runs and recomputes totals', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'it1', tenantId: 't1', paymentRunId: 'r1', included: true });
    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: PaymentRunStatus.APPROVED });
    await expect(service.toggleItem('t1', 'it1', false)).rejects.toThrow(BadRequestException);

    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: PaymentRunStatus.PROPOSED });
    itemRepo.find.mockResolvedValue([]);
    const item = await service.toggleItem('t1', 'it1', false);
    expect(item.included).toBe(false);
    expect(runRepo.update).toHaveBeenCalled(); // totals recomputed
  });

  it('approveRun requires PROPOSED; postRun requires APPROVED with included items', async () => {
    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: PaymentRunStatus.POSTED });
    await expect(service.approveRun('t1', 'r1')).rejects.toThrow('Only PROPOSED');
    await expect(service.postRun('t1', 'r1', 'u1')).rejects.toThrow('Only APPROVED');

    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: PaymentRunStatus.PROPOSED });
    const approved = await service.approveRun('t1', 'r1');
    expect(approved.status).toBe(PaymentRunStatus.APPROVED);

    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: PaymentRunStatus.APPROVED });
    itemRepo.find.mockResolvedValue([]); // nothing included
    await expect(service.postRun('t1', 'r1', 'u1')).rejects.toThrow('No included items');
  });

  it('lookups are tenant-scoped 404s', async () => {
    runRepo.findOne.mockResolvedValue(null);
    await expect(service.getProposal('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(runRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
