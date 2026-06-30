import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SpendAnalysisService } from './spend-analysis.service';
import { SpendSummary } from './entities/spend-summary.entity';
import { SavingsRecord } from './entities/savings-record.entity';
import { PurchaseOrder, PoStatus } from '../po/entities/purchase-order.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('SpendAnalysisService — Phase 206-208', () => {
  let service: SpendAnalysisService;
  let summaryRepo: any, savingsRepo: any, poRepo: any;

  beforeEach(async () => {
    summaryRepo = mockRepo(); savingsRepo = mockRepo(); poRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        SpendAnalysisService,
        { provide: getRepositoryToken(SpendSummary), useValue: summaryRepo },
        { provide: getRepositoryToken(SavingsRecord), useValue: savingsRepo },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
      ],
    }).compile();
    service = module.get(SpendAnalysisService);
  });

  // ─── Ph-206: spend cube ───────────────────────────────────────────

  it('upsertSpend — rejects bad period', async () => {
    await expect(service.upsertSpend('t1', { supplierId: 's1', period: '2026/06' })).rejects.toThrow(BadRequestException);
  });

  it('upsertSpend — accumulates onto an existing cell', async () => {
    summaryRepo.findOne.mockResolvedValue({ id: 'x', committedSpend: 100, actualSpend: 50 });
    summaryRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.upsertSpend('t1', { supplierId: 's1', period: '2026-06', committedSpend: 25, actualSpend: 10 });
    expect(r.committedSpend).toBe(125);
    expect(r.actualSpend).toBe(60);
  });

  it('rebuildFromPurchaseOrders — sums only committed POs by supplier+period', async () => {
    poRepo.find.mockResolvedValue([
      { id: 'p1', vendorId: 'v1', vendorName: 'Acme', poDate: '2026-06-10', total: 1000, status: PoStatus.APPROVED, currency: 'INR' },
      { id: 'p2', vendorId: 'v1', vendorName: 'Acme', poDate: '2026-06-20', total: 500, status: PoStatus.RELEASED, currency: 'INR' },
      { id: 'p3', vendorId: 'v1', vendorName: 'Acme', poDate: '2026-06-25', total: 999, status: PoStatus.DRAFT, currency: 'INR' },
    ]);
    summaryRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.rebuildFromPurchaseOrders('t1');
    expect(r.rebuilt).toBe(1); // one v1|2026-06 bucket
    const saved = summaryRepo.save.mock.calls[0][0];
    expect(saved.committedSpend).toBe(1500); // draft excluded
  });

  it('queryCube — groups and totals committed/actual', async () => {
    summaryRepo.find.mockResolvedValue([
      { supplierId: 's1', supplierName: 'A', category: 'IT', costCenter: 'CC1', period: '2026-06', committedSpend: 100, actualSpend: 80 },
      { supplierId: 's2', supplierName: 'B', category: 'IT', costCenter: 'CC2', period: '2026-06', committedSpend: 200, actualSpend: 150 },
    ]);
    const r = await service.queryCube('t1', { groupBy: 'category' });
    expect(r.totalCommitted).toBe(300);
    expect(r.groups[0]).toMatchObject({ key: 'IT', committed: 300, actual: 230 });
  });

  // ─── Ph-207: savings ──────────────────────────────────────────────

  it('logSavings — computes savings = (market - negotiated) * qty', async () => {
    savingsRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.logSavings('t1', { marketPrice: 100, negotiatedPrice: 85, quantity: 10, period: '2026-06' });
    expect(r.savingsAmount).toBe(150);
  });

  it('savingsSummary — totals logged savings', async () => {
    savingsRepo.find.mockResolvedValue([{ savingsAmount: 150 }, { savingsAmount: 50 }]);
    const r = await service.savingsSummary('t1', '2026-06');
    expect(r.totalSavings).toBe(200);
    expect(r.count).toBe(2);
  });

  // ─── Ph-208: maverick spend ───────────────────────────────────────

  it('detectMaverick — flags POs without requisition or with unapproved vendor', async () => {
    poRepo.find.mockResolvedValue([
      { id: 'p1', poNumber: 'PO1', vendorId: 'v1', vendorName: 'A', total: 1000, status: PoStatus.APPROVED, requisitionId: null },
      { id: 'p2', poNumber: 'PO2', vendorId: 'v2', vendorName: 'B', total: 500, status: PoStatus.RELEASED, requisitionId: 'r1' },
      { id: 'p3', poNumber: 'PO3', vendorId: 'v9', vendorName: 'C', total: 300, status: PoStatus.APPROVED, requisitionId: 'r2' },
      { id: 'p4', poNumber: 'PO4', vendorId: 'v1', vendorName: 'A', total: 9, status: PoStatus.DRAFT, requisitionId: null },
    ]);
    const r = await service.detectMaverick('t1', ['v1', 'v2']);
    // p1: no requisition; p3: unapproved vendor (v9); p2 fine; p4 draft (not committed)
    expect(r.flaggedCount).toBe(2);
    expect(r.maverickSpend).toBe(1300);
    expect(r.flagged[0].reasons).toContain('NO_REQUISITION');
  });

  it('detectMaverick — no approved list skips vendor check', async () => {
    poRepo.find.mockResolvedValue([
      { id: 'p1', poNumber: 'PO1', vendorId: 'v1', total: 100, status: PoStatus.APPROVED, requisitionId: 'r1' },
    ]);
    const r = await service.detectMaverick('t1', []);
    expect(r.flaggedCount).toBe(0);
  });
});
