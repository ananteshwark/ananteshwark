import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CapitalService } from './capital.service';
import { CapitalProjectConfig, CostTreatment } from './entities/capital-config.entity';
import { CapitalRule } from './entities/capital-rule.entity';
import { CipEntry, CipStatus } from './entities/cip-entry.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('CapitalService — Phase 248-250', () => {
  let service: CapitalService;
  let configRepo: any, ruleRepo: any, cipRepo: any;

  beforeEach(async () => {
    configRepo = mockRepo(); ruleRepo = mockRepo(); cipRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CapitalService,
        { provide: getRepositoryToken(CapitalProjectConfig), useValue: configRepo },
        { provide: getRepositoryToken(CapitalRule), useValue: ruleRepo },
        { provide: getRepositoryToken(CipEntry), useValue: cipRepo },
      ],
    }).compile();
    service = module.get(CapitalService);
  });

  // ─── Ph-248: config + rules ───────────────────────────────────────

  it('setConfig — upserts capital flag and default treatment', async () => {
    configRepo.findOne.mockResolvedValue(null);
    configRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.setConfig('t1', { projectId: 'p1', isCapital: true, defaultTreatment: CostTreatment.CAPITALIZE });
    expect(r.isCapital).toBe(true);
    expect(r.defaultTreatment).toBe(CostTreatment.CAPITALIZE);
  });

  // ─── Ph-249: CIP accumulation ─────────────────────────────────────

  it('accumulate — rejects a non-capital project', async () => {
    configRepo.findOne.mockResolvedValue({ isCapital: false });
    await expect(service.accumulate('t1', { projectId: 'p1', period: '2026-06', amount: 100 })).rejects.toThrow(BadRequestException);
  });

  it('accumulate — task rule overrides project default', async () => {
    configRepo.findOne.mockResolvedValue({ isCapital: true, defaultTreatment: CostTreatment.EXPENSE });
    ruleRepo.findOne.mockResolvedValue({ taskId: 't1', treatment: CostTreatment.CAPITALIZE });
    cipRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const e = await service.accumulate('t1', { projectId: 'p1', taskId: 't1', period: '2026-06', amount: 500 });
    expect(e.treatment).toBe(CostTreatment.CAPITALIZE);
  });

  it('accumulate — falls back to project default when no rule', async () => {
    configRepo.findOne.mockResolvedValue({ isCapital: true, defaultTreatment: CostTreatment.CAPITALIZE });
    ruleRepo.findOne.mockResolvedValue(null);
    cipRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const e = await service.accumulate('t1', { projectId: 'p1', taskId: 't2', period: '2026-06', amount: 200 });
    expect(e.treatment).toBe(CostTreatment.CAPITALIZE);
  });

  it('cipSummary — splits capitalized (CIP/transferred) vs expensed', async () => {
    cipRepo.find.mockResolvedValue([
      { treatment: CostTreatment.CAPITALIZE, status: CipStatus.ACCUMULATED, amount: 1000 },
      { treatment: CostTreatment.CAPITALIZE, status: CipStatus.TRANSFERRED, amount: 400 },
      { treatment: CostTreatment.EXPENSE, status: CipStatus.ACCUMULATED, amount: 250 },
    ]);
    const r = await service.cipSummary('t1', 'p1');
    expect(r.inCip).toBe(1000);
    expect(r.transferred).toBe(400);
    expect(r.totalCapitalized).toBe(1400);
    expect(r.expensed).toBe(250);
    expect(r.pendingTransfer).toBe(1000);
  });

  // ─── Ph-250: asset assignment ─────────────────────────────────────

  it('transferToInService — splits CIP across assets by percentage', async () => {
    cipRepo.find.mockResolvedValue([
      { id: 'c1', treatment: CostTreatment.CAPITALIZE, status: CipStatus.ACCUMULATED, amount: 600 },
      { id: 'c2', treatment: CostTreatment.CAPITALIZE, status: CipStatus.ACCUMULATED, amount: 400 },
    ]);
    cipRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.transferToInService('t1', 'p1', [{ assetName: 'Server', splitPct: 70 }, { assetName: 'Network', splitPct: 30 }]);
    expect(r.totalTransferred).toBe(1000);
    expect(r.entriesTransferred).toBe(2);
    expect(r.assets[0]).toMatchObject({ assetName: 'Server', amount: 700 });
    expect(r.assets[1]).toMatchObject({ assetName: 'Network', amount: 300 });
  });

  it('transferToInService — rejects split not summing to 100', async () => {
    await expect(service.transferToInService('t1', 'p1', [{ assetName: 'A', splitPct: 50 }, { assetName: 'B', splitPct: 40 }])).rejects.toThrow(BadRequestException);
  });

  it('transferToInService — rejects when no pending CIP', async () => {
    cipRepo.find.mockResolvedValue([]);
    await expect(service.transferToInService('t1', 'p1', [{ assetName: 'A', splitPct: 100 }])).rejects.toThrow(BadRequestException);
  });
});
