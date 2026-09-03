import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { IncentiveService } from './incentive.service';
import { IcPlan } from './entities/ic-plan.entity';
import { IcTransaction, IcTransactionStatus } from './entities/ic-transaction.entity';
import { IcDispute, DisputeStatus } from './entities/ic-dispute.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

const PLAN = {
  id: 'p1', code: 'STD', name: 'Standard', drawAmount: 0, capAmount: null,
  tiers: [
    { fromPct: 0, toPct: 100, rate: 0.03 },
    { fromPct: 100, toPct: 99999, rate: 0.06 },
  ],
  accelerators: [{ productFamily: 'CLOUD', multiplier: 1.5 }],
};

describe('IncentiveService — Phase 225-228', () => {
  let service: IncentiveService;
  let planRepo: any, txnRepo: any, disputeRepo: any;

  beforeEach(async () => {
    planRepo = mockRepo(); txnRepo = mockRepo(); disputeRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        IncentiveService,
        { provide: getRepositoryToken(IcPlan), useValue: planRepo },
        { provide: getRepositoryToken(IcTransaction), useValue: txnRepo },
        { provide: getRepositoryToken(IcDispute), useValue: disputeRepo },
      ],
    }).compile();
    service = module.get(IncentiveService);
  });

  // ─── Ph-225 ───────────────────────────────────────────────────────

  it('createPlan — requires tiers', async () => {
    await expect(service.createPlan('t1', { code: 'X', name: 'X', tiers: [] })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-226: calculation ──────────────────────────────────────────

  it('calculate — below-quota uses base tier rate', async () => {
    planRepo.findOne.mockResolvedValue(PLAN);
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026-06', bookingAmount: 10000, attainmentPct: 80 });
    expect(t.appliedRate).toBe(0.03);
    expect(t.grossCommission).toBe(300);
    expect(t.netPayable).toBe(300);
  });

  it('calculate — above-quota uses accelerated tier rate', async () => {
    planRepo.findOne.mockResolvedValue(PLAN);
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026-06', bookingAmount: 10000, attainmentPct: 120 });
    expect(t.appliedRate).toBe(0.06);
    expect(t.grossCommission).toBe(600);
  });

  it('calculate — product accelerator multiplies commission', async () => {
    planRepo.findOne.mockResolvedValue(PLAN);
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026-06', bookingAmount: 10000, attainmentPct: 80, productFamily: 'CLOUD' });
    expect(t.acceleratorMult).toBe(1.5);
    expect(t.grossCommission).toBe(450); // 10000*0.03*1.5
  });

  it('calculate — split credit reduces commission', async () => {
    planRepo.findOne.mockResolvedValue(PLAN);
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026-06', bookingAmount: 10000, attainmentPct: 80, creditPct: 50 });
    expect(t.grossCommission).toBe(150); // 300 * 0.5
  });

  it('calculate — cap and draw applied', async () => {
    planRepo.findOne.mockResolvedValue({ ...PLAN, capAmount: 200, drawAmount: 50 });
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const t = await service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026-06', bookingAmount: 10000, attainmentPct: 80 });
    expect(t.grossCommission).toBe(200); // capped from 300
    expect(t.drawRecovered).toBe(50);
    expect(t.netPayable).toBe(150);
  });

  it('calculate — rejects bad period', async () => {
    planRepo.findOne.mockResolvedValue(PLAN);
    await expect(service.calculate('t1', { planId: 'p1', repId: 'r1', period: '2026/06', bookingAmount: 1, attainmentPct: 80 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-227: disputes ─────────────────────────────────────────────

  it('raiseDispute — flags transaction DISPUTED', async () => {
    txnRepo.findOne.mockResolvedValue({ id: 'tx1', status: IcTransactionStatus.CALCULATED });
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    disputeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const d = await service.raiseDispute('t1', { transactionId: 'tx1', repId: 'r1', reason: 'missing deal' });
    expect(d.status).toBe(DisputeStatus.OPEN);
    expect(txnRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: IcTransactionStatus.DISPUTED }));
  });

  it('resolveDispute — APPROVE applies adjustment and re-approves txn', async () => {
    disputeRepo.findOne.mockResolvedValue({ id: 'd1', transactionId: 'tx1', status: DisputeStatus.OPEN });
    txnRepo.findOne.mockResolvedValue({ id: 'tx1', netPayable: 300, grossCommission: 300, status: IcTransactionStatus.DISPUTED });
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    disputeRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const d = await service.resolveDispute('t1', 'd1', 'mgr', { decision: 'APPROVE', adjustmentAmount: 100 });
    expect(d.status).toBe(DisputeStatus.RESOLVED);
    expect(d.adjustmentAmount).toBe(100);
    expect(txnRepo.save).toHaveBeenCalledWith(expect.objectContaining({ netPayable: 400, status: IcTransactionStatus.APPROVED }));
  });

  // ─── Ph-228: payroll export ───────────────────────────────────────

  it('exportToPayroll — aggregates approved commissions per rep and marks PAID', async () => {
    txnRepo.find.mockResolvedValue([
      { id: 'tx1', repId: 'r1', netPayable: 300, status: IcTransactionStatus.APPROVED },
      { id: 'tx2', repId: 'r1', netPayable: 150, status: IcTransactionStatus.APPROVED },
      { id: 'tx3', repId: 'r2', netPayable: 500, status: IcTransactionStatus.APPROVED },
    ]);
    txnRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.exportToPayroll('t1', '2026-06');
    expect(r.exported).toBe(2);
    expect(r.totalAmount).toBe(950);
    expect(r.elements.find((e: any) => e.repId === 'r1').amount).toBe(450);
  });
});
