import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FixedAssetsService } from './fixed-assets.service';
import { AssetStatus } from './entities/fixed-asset.entity';
import { DepreciationMethod } from './entities/asset-category.entity';
import { DepreciationRunStatus } from './entities/depreciation-run.entity';

/**
 * Fixed assets: SLM/WDV depreciation math with residual-value floor,
 * duplicate-period run guard, run posting a balanced Dr expense / Cr
 * accumulated-depreciation JE, and disposal computing gain/loss and
 * closing the asset.
 */
describe('FixedAssetsService', () => {
  let service: FixedAssetsService;
  let categoryRepo: any, assetRepo: any, runRepo: any, runLineRepo: any, areaRepo: any, glService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    categoryRepo = mockRepo(); assetRepo = mockRepo(); runRepo = mockRepo();
    runLineRepo = mockRepo(); areaRepo = mockRepo();
    glService = {
      findAccounts: jest.fn().mockResolvedValue({ items: [{ id: 'acct-1' }] }),
      postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }),
    };
    service = new FixedAssetsService(categoryRepo, assetRepo, runRepo, runLineRepo, areaRepo, glService);
  });

  const slmAsset = (over: any = {}) => ({
    id: 'a1', tenantId: 't1', assetCode: 'FA-1', name: 'Laptop', status: AssetStatus.ACTIVE,
    depreciationMethod: DepreciationMethod.SLM,
    acquisitionCost: 1200, residualValue: 0, usefulLifeMonths: 12,
    netBookValue: 1200, accumulatedDepreciation: 0,
    glAccountId: null, accumulatedDepGlAccountId: null, depreciationGlAccountId: null,
    ...over,
  });

  it('createAsset seeds NBV = acquisition cost and rejects duplicate codes', async () => {
    const a = await service.createAsset('t1', { assetCode: 'FA-1', acquisitionCost: 1200 } as any);
    expect(a.netBookValue).toBe(1200);
    expect(a.status).toBe(AssetStatus.ACTIVE);

    assetRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createAsset('t1', { assetCode: 'FA-1', acquisitionCost: 1 } as any)).rejects.toThrow(ConflictException);
  });

  it('runDepreciation computes SLM monthly amounts and updates NBV', async () => {
    runRepo.findOne.mockResolvedValue(null);
    assetRepo.find.mockResolvedValue([slmAsset()]);
    const run = await service.runDepreciation('t1', { periodYear: 2026, periodMonth: 7 } as any, 'u1');
    // 1200 / 12 months = 100/month
    expect(runLineRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      depreciationAmount: 100, openingNbv: 1200, closingNbv: 1100,
    }));
    expect(run.totalDepreciation).toBe(100);
    expect(run.assetCount).toBe(1);
    expect(assetRepo.save).toHaveBeenCalledWith([expect.objectContaining({
      accumulatedDepreciation: 100, netBookValue: 1100,
    })]);
  });

  it('depreciation never drops NBV below residual value', async () => {
    runRepo.findOne.mockResolvedValue(null);
    // SLM monthly would be (1200-200)/12 = 83.33, but only 50 remains above residual
    assetRepo.find.mockResolvedValue([slmAsset({ residualValue: 200, netBookValue: 250 })]);
    await service.runDepreciation('t1', { periodYear: 2026, periodMonth: 7 } as any, 'u1');
    expect(runLineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ depreciationAmount: 50, closingNbv: 200 }));
  });

  it('a fully depreciated asset produces no line', async () => {
    runRepo.findOne.mockResolvedValue(null);
    assetRepo.find.mockResolvedValue([slmAsset({ netBookValue: 0 })]);
    const run = await service.runDepreciation('t1', { periodYear: 2026, periodMonth: 7 } as any, 'u1');
    expect(run.assetCount).toBe(0);
    expect(runLineRepo.create).not.toHaveBeenCalled();
  });

  it('a duplicate period run is rejected (H2-style guard)', async () => {
    runRepo.findOne.mockResolvedValue({ id: 'existing-run' });
    await expect(service.runDepreciation('t1', { periodYear: 2026, periodMonth: 7 } as any, 'u1')).rejects.toThrow(ConflictException);
  });

  it('postDepreciationRun posts a balanced Dr expense / Cr accumulated JE and stamps POSTED', async () => {
    runRepo.findOne.mockResolvedValue({
      id: 'run1', tenantId: 't1', status: DepreciationRunStatus.DRAFT,
      totalDepreciation: 100, periodYear: 2026, periodMonth: 7, runDate: '2026-07-31',
    });
    runLineRepo.find.mockResolvedValue([{ id: 'l1' }]);
    const run = await service.postDepreciationRun('t1', 'run1', 'u1');
    const [, jeDto] = glService.postJournalEntry.mock.calls[0];
    const debits = jeDto.lines.reduce((s: number, l: any) => s + l.debit, 0);
    const credits = jeDto.lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(debits).toBe(credits);
    expect(run.status).toBe(DepreciationRunStatus.POSTED);
    expect(run.journalEntryId).toBe('je-1');
  });

  it('postDepreciationRun requires DRAFT and at least one line', async () => {
    runRepo.findOne.mockResolvedValue({ id: 'run1', tenantId: 't1', status: DepreciationRunStatus.POSTED });
    await expect(service.postDepreciationRun('t1', 'run1', 'u1')).rejects.toThrow('Only DRAFT');

    runRepo.findOne.mockResolvedValue({ id: 'run1', tenantId: 't1', status: DepreciationRunStatus.DRAFT });
    runLineRepo.find.mockResolvedValue([]);
    await expect(service.postDepreciationRun('t1', 'run1', 'u1')).rejects.toThrow('No depreciation lines');
  });

  it('disposeAsset requires ACTIVE, records the disposal, and closes the asset', async () => {
    assetRepo.findOne.mockResolvedValue(slmAsset({ status: AssetStatus.DISPOSED }));
    await expect(service.disposeAsset('t1', 'a1', { disposalDate: 'd', disposalAmount: 1 } as any, 'u1')).rejects.toThrow(BadRequestException);

    const asset: any = slmAsset({ netBookValue: 500, accumulatedDepreciation: 700 });
    assetRepo.findOne.mockResolvedValue(asset);
    const disposed = await service.disposeAsset('t1', 'a1', { disposalDate: '2026-07-04', disposalAmount: 650, disposalReason: 'sold' } as any, 'u1');
    expect(disposed.status).toBe(AssetStatus.DISPOSED);
    expect(disposed.disposalAmount).toBe(650);
    expect(disposed.disposalReason).toBe('sold');
  });

  it('updateAsset is ACTIVE-only and lookups 404 tenant-scoped', async () => {
    assetRepo.findOne.mockResolvedValue(slmAsset({ status: AssetStatus.RETIRED }));
    await expect(service.updateAsset('t1', 'a1', {} as any)).rejects.toThrow(BadRequestException);

    assetRepo.findOne.mockResolvedValue(null);
    await expect(service.findAsset('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(assetRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'x' } });
  });
});
