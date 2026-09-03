import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PredictiveService } from './predictive.service';
import { PredictiveScore, PredictiveModel } from './entities/predictive-score.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('PredictiveService — Phase 255', () => {
  let service: PredictiveService;
  let scoreRepo: any;

  beforeEach(async () => {
    scoreRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        PredictiveService,
        { provide: getRepositoryToken(PredictiveScore), useValue: scoreRepo },
      ],
    }).compile();
    service = module.get(PredictiveService);
  });

  it('scoreChurn — high signals produce a HIGH band', async () => {
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.scoreChurn('t1', 'c1', { daysSinceLastOrder: 200, openSupportTickets: 5, npsScore: 2, contractDaysToExpiry: 10 });
    expect(r.band).toBe('HIGH');
    expect(r.score).toBeGreaterThan(66);
    expect(r.model).toBe(PredictiveModel.CHURN_RISK);
  });

  it('scoreChurn — healthy signals produce a LOW band', async () => {
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.scoreChurn('t1', 'c1', { daysSinceLastOrder: 10, openSupportTickets: 0, npsScore: 9, contractDaysToExpiry: 300 });
    expect(r.band).toBe('LOW');
  });

  it('scoreChurn — upserts an existing score', async () => {
    scoreRepo.findOne.mockResolvedValue({ id: 's1', score: 10, band: 'LOW', factors: [] });
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.scoreChurn('t1', 'c1', { daysSinceLastOrder: 200, openSupportTickets: 5, npsScore: 1 });
    expect(scoreRepo.create).not.toHaveBeenCalled();
  });

  it('scoreLatePayment — poor history drives probability up', async () => {
    scoreRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.scoreLatePayment('t1', 'inv1', { avgDaysLateHistory: 30, outstandingRatio: 0.9, daysToDue: -3 });
    expect(r.score).toBeGreaterThan(66);
    expect(r.band).toBe('HIGH');
  });

  it('demandForecastAccuracy — computes MAPE, accuracy, and bias', () => {
    const r = service.demandForecastAccuracy([
      { forecast: 100, actual: 120 }, // ape 20/120
      { forecast: 100, actual: 80 },  // ape 20/80
    ]);
    // mape = ((0.1667)+(0.25))/2 = 0.2083 → 20.83%
    expect(r.mape).toBeCloseTo(20.83, 1);
    expect(r.accuracyPct).toBeCloseTo(79.17, 1);
    expect(r.bias).toBe(0); // (+20 -20)/2
  });

  it('demandForecastAccuracy — detects under-forecast bias', () => {
    const r = service.demandForecastAccuracy([{ forecast: 100, actual: 130 }, { forecast: 100, actual: 140 }]);
    expect(r.biasDirection).toBe('UNDER_FORECAST');
  });

  it('demandForecastAccuracy — rejects empty series', () => {
    expect(() => service.demandForecastAccuracy([])).toThrow(BadRequestException);
  });

  it('topRisks — returns scores sorted desc limited', async () => {
    scoreRepo.find.mockResolvedValue([{ score: 90 }, { score: 40 }]);
    const r = await service.topRisks('t1', PredictiveModel.CHURN_RISK, 1);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(90);
  });
});
