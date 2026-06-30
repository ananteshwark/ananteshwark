import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { TerritoriesService } from './territories.service';
import { Territory } from './entities/territory.entity';
import { Quota } from './entities/quota.entity';
import { CrmOpportunity, OpportunityStage } from '../entities/crm-opportunity.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('TerritoriesService — Phase 217-219', () => {
  let service: TerritoriesService;
  let terrRepo: any, quotaRepo: any, oppRepo: any;

  beforeEach(async () => {
    terrRepo = mockRepo(); quotaRepo = mockRepo(); oppRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        TerritoriesService,
        { provide: getRepositoryToken(Territory), useValue: terrRepo },
        { provide: getRepositoryToken(Quota), useValue: quotaRepo },
        { provide: getRepositoryToken(CrmOpportunity), useValue: oppRepo },
      ],
    }).compile();
    service = module.get(TerritoriesService);
  });

  // ─── Ph-217 ───────────────────────────────────────────────────────

  it('createTerritory — rejects duplicate code', async () => {
    terrRepo.findOne.mockResolvedValue({ id: 't1' });
    await expect(service.createTerritory('t1', { code: 'WEST', name: 'West' })).rejects.toThrow(BadRequestException);
  });

  it('matchTerritory — named account outranks industry and region', async () => {
    terrRepo.find.mockResolvedValue([
      { id: 'r1', code: 'REG', name: 'Region', isActive: true, regions: ['APAC'], industries: [], accountIds: [] },
      { id: 'a1', code: 'ACC', name: 'Named', isActive: true, regions: [], industries: ['TECH'], accountIds: ['ACME'] },
    ]);
    const r = await service.matchTerritory('t1', { accountId: 'ACME', region: 'APAC', industry: 'TECH' });
    expect(r.matched).toBe(true);
    expect(r.code).toBe('ACC');
    expect(r.matchedBy).toBe('NAMED_ACCOUNT');
  });

  it('matchTerritory — no match returns matched=false', async () => {
    terrRepo.find.mockResolvedValue([{ id: 'r1', isActive: true, regions: ['EMEA'], industries: [], accountIds: [] }]);
    const r = await service.matchTerritory('t1', { region: 'APAC' });
    expect(r.matched).toBe(false);
  });

  // ─── Ph-218 ───────────────────────────────────────────────────────

  it('setQuota — rejects bad period', async () => {
    await expect(service.setQuota('t1', { repId: 'r1', period: '2026-2', quotaAmount: 100 })).rejects.toThrow(BadRequestException);
  });

  it('setQuota — upserts existing quota row', async () => {
    quotaRepo.findOne.mockResolvedValue({ id: 'q1', quotaAmount: 100 });
    quotaRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.setQuota('t1', { repId: 'r1', period: '2026-Q2', quotaAmount: 250 });
    expect(r.quotaAmount).toBe(250);
    expect(quotaRepo.create).not.toHaveBeenCalled();
  });

  // ─── Ph-219 ───────────────────────────────────────────────────────

  it('attainment — computes pct from closed-won vs quota', async () => {
    quotaRepo.find.mockResolvedValue([
      { repId: 'r1', quotaAmount: 1000 },
      { repId: 'r1', quotaAmount: 500 }, // second territory row aggregates
      { repId: 'r2', quotaAmount: 2000 },
    ]);
    oppRepo.find.mockResolvedValue([
      { ownerId: 'r1', stage: OpportunityStage.CLOSED_WON, value: 900, expectedCloseDate: '2026-05-01' },
      { ownerId: 'r1', stage: OpportunityStage.CLOSED_WON, value: 200, expectedCloseDate: '2026-06-01' },
      { ownerId: 'r2', stage: OpportunityStage.PROPOSAL, value: 999, expectedCloseDate: '2026-06-01' },
    ]);
    const r = await service.attainment('t1', '2026-Q2');
    const r1 = r.reps.find((x: any) => x.repId === 'r1');
    expect(r1.quota).toBe(1500);
    expect(r1.attained).toBe(1100);
    expect(r1.attainmentPct).toBe(73.33);
    const r2 = r.reps.find((x: any) => x.repId === 'r2');
    expect(r2.attained).toBe(0); // only proposal, not won
    expect(r.totalQuota).toBe(3500);
  });

  it('attainment — ignores opportunities outside the period', async () => {
    quotaRepo.find.mockResolvedValue([{ repId: 'r1', quotaAmount: 1000 }]);
    oppRepo.find.mockResolvedValue([
      { ownerId: 'r1', stage: OpportunityStage.CLOSED_WON, value: 900, expectedCloseDate: '2026-01-01' }, // Q1
    ]);
    const r = await service.attainment('t1', '2026-Q2');
    expect(r.reps[0].attained).toBe(0);
  });
});
