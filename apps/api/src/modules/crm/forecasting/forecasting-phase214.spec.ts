import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ForecastingService, quarterOf } from './forecasting.service';
import { ForecastCategoryAssignment, ForecastCategory } from './entities/forecast-category.entity';
import { ForecastOverride } from './entities/forecast-override.entity';
import { ForecastSnapshot } from './entities/forecast-snapshot.entity';
import { CrmOpportunity, OpportunityStage } from '../entities/crm-opportunity.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ForecastingService — Phase 214-216', () => {
  let service: ForecastingService;
  let catRepo: any, overrideRepo: any, snapRepo: any, oppRepo: any;

  beforeEach(async () => {
    catRepo = mockRepo(); overrideRepo = mockRepo(); snapRepo = mockRepo(); oppRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ForecastingService,
        { provide: getRepositoryToken(ForecastCategoryAssignment), useValue: catRepo },
        { provide: getRepositoryToken(ForecastOverride), useValue: overrideRepo },
        { provide: getRepositoryToken(ForecastSnapshot), useValue: snapRepo },
        { provide: getRepositoryToken(CrmOpportunity), useValue: oppRepo },
      ],
    }).compile();
    service = module.get(ForecastingService);
  });

  it('quarterOf — maps month to quarter', () => {
    expect(quarterOf('2026-02-15')).toBe('2026-Q1');
    expect(quarterOf('2026-11-01')).toBe('2026-Q4');
  });

  // ─── Ph-214 ───────────────────────────────────────────────────────

  it('assignCategory — derives period from close date', async () => {
    oppRepo.findOne.mockResolvedValue({ id: 'o1', ownerId: 'r1', expectedCloseDate: '2026-05-10' });
    catRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.assignCategory('t1', { opportunityId: 'o1', category: ForecastCategory.COMMIT });
    expect(catRepo.create).toHaveBeenCalledWith(expect.objectContaining({ period: '2026-Q2', category: ForecastCategory.COMMIT }));
    expect(r).toBeDefined();
  });

  it('assignCategory — throws when opportunity missing', async () => {
    oppRepo.findOne.mockResolvedValue(null);
    await expect(service.assignCategory('t1', { opportunityId: 'x', category: ForecastCategory.COMMIT, period: '2026-Q2' })).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-215: roll-up ──────────────────────────────────────────────

  it('rollup — commit/bestCase/weightedPipeline per owner', async () => {
    oppRepo.find.mockResolvedValue([
      { id: 'o1', ownerId: 'r1', value: 1000, stage: OpportunityStage.NEGOTIATION, probability: 80, expectedCloseDate: '2026-05-01' },
      { id: 'o2', ownerId: 'r1', value: 500, stage: OpportunityStage.PROPOSAL, probability: 40, expectedCloseDate: '2026-06-01' },
    ]);
    catRepo.find.mockResolvedValue([
      { opportunityId: 'o1', category: ForecastCategory.COMMIT },
      { opportunityId: 'o2', category: ForecastCategory.BEST_CASE },
    ]);
    overrideRepo.find.mockResolvedValue([]);
    const r = await service.rollup('t1', '2026-Q2');
    const r1 = r.owners.find((o: any) => o.ownerId === 'r1');
    expect(r1.commit).toBe(1000);
    expect(r1.bestCase).toBe(1500); // 1000 + 500
    expect(r1.weightedPipeline).toBe(1000); // 1000*.8 + 500*.4
    expect(r.teamCommit).toBe(1000);
  });

  it('rollup — manager override replaces commit', async () => {
    oppRepo.find.mockResolvedValue([
      { id: 'o1', ownerId: 'r1', value: 1000, stage: OpportunityStage.NEGOTIATION, probability: 80, expectedCloseDate: '2026-05-01' },
    ]);
    catRepo.find.mockResolvedValue([{ opportunityId: 'o1', category: ForecastCategory.COMMIT }]);
    overrideRepo.find.mockResolvedValue([{ ownerId: 'r1', overrideAmount: 1200 }]);
    const r = await service.rollup('t1', '2026-Q2');
    expect(r.owners[0].finalCommit).toBe(1200);
    expect(r.teamCommit).toBe(1200);
  });

  it('rollup — OMITTED opportunities are excluded', async () => {
    oppRepo.find.mockResolvedValue([
      { id: 'o1', ownerId: 'r1', value: 1000, stage: OpportunityStage.NEGOTIATION, probability: 80, expectedCloseDate: '2026-05-01' },
    ]);
    catRepo.find.mockResolvedValue([{ opportunityId: 'o1', category: ForecastCategory.OMITTED }]);
    overrideRepo.find.mockResolvedValue([]);
    const r = await service.rollup('t1', '2026-Q2');
    expect(r.owners).toHaveLength(0);
  });

  // ─── Ph-216: accuracy & win rate ──────────────────────────────────

  it('accuracy — variance vs earliest snapshot commit', async () => {
    snapRepo.find.mockResolvedValue([
      { snapshotDate: '2026-04-01', ownerId: 'r1', commitAmount: 1000 },
      { snapshotDate: '2026-04-01', ownerId: 'r2', commitAmount: 500 },
      { snapshotDate: '2026-05-01', ownerId: 'r1', commitAmount: 1200 },
    ]);
    oppRepo.find.mockResolvedValue([
      { id: 'o1', stage: OpportunityStage.CLOSED_WON, value: 1400, expectedCloseDate: '2026-06-15' },
    ]);
    const r = await service.accuracy('t1', '2026-Q2');
    expect(r.committed).toBe(1500); // earliest snapshot total
    expect(r.actual).toBe(1400);
    expect(r.variance).toBe(-100);
  });

  it('winRate — won/(won+lost)', async () => {
    oppRepo.find.mockResolvedValue([
      { id: 'o1', stage: OpportunityStage.CLOSED_WON, value: 100, expectedCloseDate: '2026-05-01' },
      { id: 'o2', stage: OpportunityStage.CLOSED_WON, value: 100, expectedCloseDate: '2026-05-01' },
      { id: 'o3', stage: OpportunityStage.CLOSED_LOST, value: 100, expectedCloseDate: '2026-05-01' },
      { id: 'o4', stage: OpportunityStage.PROPOSAL, value: 100, expectedCloseDate: '2026-05-01' },
    ]);
    const r = await service.winRate('t1', '2026-Q2');
    expect(r.won).toBe(2);
    expect(r.lost).toBe(1);
    expect(r.winRatePct).toBe(66.67);
  });
});
