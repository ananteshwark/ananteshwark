import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CostingService } from './costing.service';
import { StandardCost } from './entities/standard-cost.entity';
import { CostVariance, VarianceType } from './entities/cost-variance.entity';
import { CostUpdate, CostUpdateStatus } from './entities/cost-update.entity';
import { StockBalance } from '../entities/stock-balance.entity';
import { Item } from '../entities/item.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { GlService } from '../../finance/gl/gl.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  createQueryBuilder: jest.fn(),
});

describe('CostingService — Phase 137-140', () => {
  let service: CostingService;
  let stdRepo: any, varRepo: any, updateRepo: any, balanceRepo: any, itemRepo: any, accountRepo: any, glService: any;

  beforeEach(async () => {
    stdRepo = mockRepo(); varRepo = mockRepo(); updateRepo = mockRepo();
    balanceRepo = mockRepo(); itemRepo = mockRepo(); accountRepo = mockRepo();
    glService = { postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }) };
    accountRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve({ id: `acc-${where.code}`, code: where.code }));
    const module = await Test.createTestingModule({
      providers: [
        CostingService,
        { provide: getRepositoryToken(StandardCost), useValue: stdRepo },
        { provide: getRepositoryToken(CostVariance), useValue: varRepo },
        { provide: getRepositoryToken(CostUpdate), useValue: updateRepo },
        { provide: getRepositoryToken(StockBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(CostingService);
  });

  // ─── Ph-137: WAC ──────────────────────────────────────────────────

  it('computeMovingAverage — blends existing and receipt value', () => {
    // 10 @ 5 = 50; receive 10 @ 7 = 70; → 20 @ 6
    const r = service.computeMovingAverage(10, 5, 10, 7);
    expect(r.newQty).toBe(20);
    expect(r.newAvgCost).toBe(6);
    expect(r.newTotalValue).toBe(120);
  });

  it('computeMovingAverage — first receipt sets the average', () => {
    const r = service.computeMovingAverage(0, 0, 100, 3.5);
    expect(r.newQty).toBe(100);
    expect(r.newAvgCost).toBe(3.5);
  });

  it('computeMovingAverage — issue keeps average unchanged', () => {
    const r = service.computeMovingAverage(20, 6, -5, 0);
    expect(r.newQty).toBe(15);
    expect(r.newAvgCost).toBe(6);
    expect(r.newTotalValue).toBe(90);
  });

  it('applyReceiptToBalance — creates balance and rolls average', async () => {
    balanceRepo.findOne.mockResolvedValue(null);
    balanceRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const b = await service.applyReceiptToBalance('t1', 'i1', 'w1', 100, 4);
    expect(b.qtyOnHand).toBe(100);
    expect(b.avgCost).toBe(4);
    expect(b.totalValue).toBe(400);
  });

  // ─── Ph-138: standard cost + PPV ──────────────────────────────────

  it('setStandardCost — rejects negative', async () => {
    await expect(service.setStandardCost('t1', { itemId: 'i1', standardCost: -1, effectiveFrom: '2026-01-01' })).rejects.toThrow(BadRequestException);
  });

  it('getActiveStandard — latest effective record wins', async () => {
    stdRepo.find.mockResolvedValue([
      { standardCost: 10, effectiveFrom: '2026-01-01' },
      { standardCost: 12, effectiveFrom: '2026-06-01' },
      { standardCost: 99, effectiveFrom: '2027-01-01' }, // future, excluded
    ]);
    expect(await service.getActiveStandard('t1', 'i1', '2026-06-15')).toBe(12);
  });

  it('getActiveStandard — falls back to item standardCost', async () => {
    stdRepo.find.mockResolvedValue([]);
    itemRepo.findOne.mockResolvedValue({ standardCost: 7 });
    expect(await service.getActiveStandard('t1', 'i1', '2026-06-15')).toBe(7);
  });

  it('recordPpv — computes (actual − standard) × qty', async () => {
    stdRepo.find.mockResolvedValue([{ standardCost: 10, effectiveFrom: '2026-01-01' }]);
    const v = await service.recordPpv('t1', { itemId: 'i1', quantity: 100, actualUnitCost: 11, date: '2026-06-01', vendorId: 'vend1' });
    expect(varRepo.create).toHaveBeenCalledWith(expect.objectContaining({ varianceType: VarianceType.PPV, varianceAmount: 100, standardCost: 10, actualCost: 11 }));
    expect(v.id).toBe('gen-1');
  });

  // ─── Ph-139: cost update ──────────────────────────────────────────

  it('costUpdate — revalues inventory and posts JE (increase)', async () => {
    stdRepo.find.mockResolvedValue([{ standardCost: 10, effectiveFrom: '2026-01-01' }]); // old standard 10
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 50 }, { qtyOnHand: 50 }]); // 100 on hand
    updateRepo.save.mockImplementation((x: any) => Promise.resolve(x.id ? x : { id: 'cu1', ...x }));
    stdRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    varRepo.save.mockImplementation((x: any) => Promise.resolve(x));

    const cu = await service.costUpdate('t1', { itemId: 'i1', newStandard: 12, effectiveDate: '2026-07-01' }, 'u1');
    // revaluation = (12 - 10) * 100 = 200
    expect(updateRepo.create).toHaveBeenCalledWith(expect.objectContaining({ revaluationAmount: 200, oldStandard: 10, newStandard: 12, qtyOnHand: 100 }));
    expect(glService.postJournalEntry).toHaveBeenCalled();
    const lines = glService.postJournalEntry.mock.calls[0][1].lines;
    expect(lines.find((l: any) => l.debit === 200 && l.description.includes('increase'))).toBeTruthy();
    expect(cu.status).toBe(CostUpdateStatus.POSTED);
  });

  it('costUpdate — no JE when revaluation is zero', async () => {
    stdRepo.find.mockResolvedValue([{ standardCost: 10, effectiveFrom: '2026-01-01' }]);
    balanceRepo.find.mockResolvedValue([{ qtyOnHand: 100 }]);
    updateRepo.save.mockImplementation((x: any) => Promise.resolve(x.id ? x : { id: 'cu1', ...x }));
    stdRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    varRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.costUpdate('t1', { itemId: 'i1', newStandard: 10, effectiveDate: '2026-07-01' }, 'u1');
    expect(glService.postJournalEntry).not.toHaveBeenCalled();
  });

  // ─── Ph-140: dashboard ────────────────────────────────────────────

  it('varianceDashboard — aggregates by type, item, vendor', async () => {
    varRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { varianceType: 'PPV', itemId: 'i1', vendorId: 'v1', varianceAmount: 100 },
        { varianceType: 'PPV', itemId: 'i2', vendorId: 'v1', varianceAmount: 50 },
        { varianceType: 'MUV', itemId: 'i1', vendorId: null, varianceAmount: -30 },
      ]),
    });
    const d = await service.varianceDashboard('t1', {});
    expect(d.totalVariance).toBe(120);
    expect(d.count).toBe(3);
    expect(d.byType.find((r: any) => r.varianceType === 'PPV').amount).toBe(150);
    expect(d.byVendor.find((r: any) => r.vendorId === 'v1').amount).toBe(150);
  });
});
