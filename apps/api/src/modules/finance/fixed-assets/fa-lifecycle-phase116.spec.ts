import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FaLifecycleService } from './fa-lifecycle.service';
import { CipAsset, CipStatus } from './entities/cip-asset.entity';
import { FixedAsset, AssetStatus } from './entities/fixed-asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { Account } from '../gl/entities/account.entity';
import { GlService } from '../gl/gl.service';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve({ id: x.id ?? 'gen-1', ...x })),
});

describe('FaLifecycleService — Phase 116-120', () => {
  let service: FaLifecycleService;
  let cipRepo: ReturnType<typeof mockRepo>;
  let assetRepo: ReturnType<typeof mockRepo>;
  let categoryRepo: ReturnType<typeof mockRepo>;
  let accountRepo: ReturnType<typeof mockRepo>;
  let glService: { postJournalEntry: jest.Mock; findAccount: jest.Mock };

  beforeEach(async () => {
    cipRepo = mockRepo();
    assetRepo = mockRepo();
    categoryRepo = mockRepo();
    accountRepo = mockRepo();
    glService = {
      postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }),
      findAccount: jest.fn().mockImplementation((_t, id) => Promise.resolve({ id, code: 'X' })),
    };
    accountRepo.findOne.mockImplementation(({ where }: any) => Promise.resolve({ id: `acc-${where.code}`, code: where.code }));

    const module = await Test.createTestingModule({
      providers: [
        FaLifecycleService,
        { provide: getRepositoryToken(CipAsset), useValue: cipRepo },
        { provide: getRepositoryToken(FixedAsset), useValue: assetRepo },
        { provide: getRepositoryToken(AssetCategory), useValue: categoryRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(FaLifecycleService);
  });

  // ─── Ph-116: CIP ──────────────────────────────────────────────────

  it('addCipCost — accumulates cost and appends line', async () => {
    cipRepo.findOne.mockResolvedValue({ id: 'cip1', status: CipStatus.IN_PROGRESS, accumulatedCost: 1000, costLines: [] });
    cipRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const cip = await service.addCipCost('t1', 'cip1', { date: '2026-06-01', description: 'steel', amount: 500 });
    expect(cip.accumulatedCost).toBe(1500);
    expect(cip.costLines).toHaveLength(1);
  });

  it('addCipCost — rejects on non-in-progress', async () => {
    cipRepo.findOne.mockResolvedValue({ id: 'cip1', status: CipStatus.CAPITALIZED, accumulatedCost: 0, costLines: [] });
    await expect(service.addCipCost('t1', 'cip1', { date: '2026-06-01', description: 'x', amount: 100 })).rejects.toThrow(BadRequestException);
  });

  it('capitalizeCip — creates asset, posts JE, marks capitalized', async () => {
    cipRepo.findOne.mockResolvedValue({ id: 'cip1', cipCode: 'CIP-1', name: 'Plant', categoryId: 'cat1', status: CipStatus.IN_PROGRESS, accumulatedCost: 10000, cipGlAccountId: null });
    categoryRepo.findOne.mockResolvedValue({ id: 'cat1', depreciationMethod: 'STRAIGHT_LINE', assetGlAccountId: 'fa-acc' });
    assetRepo.save.mockResolvedValue({ id: 'asset1', assetCode: 'CIP-1-CAP' });
    cipRepo.save.mockImplementation((x: any) => Promise.resolve(x));

    const result = await service.capitalizeCip('t1', 'cip1', { capitalizedDate: '2026-06-30', usefulLifeMonths: 120 }, 'u1');
    expect(assetRepo.create).toHaveBeenCalledWith(expect.objectContaining({ acquisitionCost: 10000, netBookValue: 10000 }));
    expect(glService.postJournalEntry).toHaveBeenCalled();
    expect(result.cip.status).toBe(CipStatus.CAPITALIZED);
    expect(result.cip.assetId).toBe('asset1');
  });

  it('capitalizeCip — rejects zero cost', async () => {
    cipRepo.findOne.mockResolvedValue({ id: 'cip1', status: CipStatus.IN_PROGRESS, accumulatedCost: 0 });
    await expect(service.capitalizeCip('t1', 'cip1', { capitalizedDate: '2026-06-30', usefulLifeMonths: 120 }, 'u1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-119: Impairment ───────────────────────────────────────────

  it('recordImpairment — reduces NBV and posts loss JE', async () => {
    assetRepo.findOne.mockResolvedValue({ id: 'a1', assetCode: 'A1', status: AssetStatus.ACTIVE, netBookValue: 10000, accumulatedImpairment: 0 });
    assetRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const asset = await service.recordImpairment('t1', 'a1', { date: '2026-06-30', recoverableAmount: 7000 }, 'u1');
    expect(asset.accumulatedImpairment).toBe(3000);
    expect(asset.netBookValue).toBe(7000);
    expect(asset.status).toBe(AssetStatus.IMPAIRED);
    const jeLines = glService.postJournalEntry.mock.calls[0][1].lines;
    expect(jeLines.find((l: any) => l.debit === 3000)).toBeTruthy();
  });

  it('recordImpairment — rejects when recoverable >= carrying', async () => {
    assetRepo.findOne.mockResolvedValue({ id: 'a1', status: AssetStatus.ACTIVE, netBookValue: 5000, accumulatedImpairment: 0 });
    await expect(service.recordImpairment('t1', 'a1', { date: '2026-06-30', recoverableAmount: 6000 }, 'u1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-120: Revaluation ──────────────────────────────────────────

  it('revalue — upward credits revaluation reserve', async () => {
    assetRepo.findOne.mockResolvedValue({ id: 'a1', assetCode: 'A1', status: AssetStatus.ACTIVE, netBookValue: 8000, revaluationReserve: 0, glAccountId: 'fa' });
    assetRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const asset = await service.revalue('t1', 'a1', { date: '2026-06-30', fairValue: 10000 }, 'u1');
    expect(asset.revaluationReserve).toBe(2000);
    expect(asset.netBookValue).toBe(10000);
    const lines = glService.postJournalEntry.mock.calls[0][1].lines;
    expect(lines.find((l: any) => l.debit === 2000)).toBeTruthy(); // asset up
  });

  it('revalue — downward reverses reserve first then P&L', async () => {
    assetRepo.findOne.mockResolvedValue({ id: 'a1', assetCode: 'A1', status: AssetStatus.ACTIVE, netBookValue: 10000, revaluationReserve: 1500, glAccountId: 'fa' });
    assetRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const asset = await service.revalue('t1', 'a1', { date: '2026-06-30', fairValue: 7000 }, 'u1');
    // decrease 3000: 1500 from reserve, 1500 to P&L
    expect(asset.revaluationReserve).toBe(0);
    expect(asset.netBookValue).toBe(7000);
    const lines = glService.postJournalEntry.mock.calls[0][1].lines;
    const reserveDr = lines.find((l: any) => l.description.includes('Reverse revaluation'));
    const pnlDr = lines.find((l: any) => l.description.includes('P&L'));
    expect(reserveDr.debit).toBe(1500);
    expect(pnlDr.debit).toBe(1500);
  });

  it('revalue — rejects when fair value equals carrying', async () => {
    assetRepo.findOne.mockResolvedValue({ id: 'a1', status: AssetStatus.ACTIVE, netBookValue: 5000, revaluationReserve: 0 });
    await expect(service.revalue('t1', 'a1', { date: '2026-06-30', fairValue: 5000 }, 'u1')).rejects.toThrow(BadRequestException);
  });
});
