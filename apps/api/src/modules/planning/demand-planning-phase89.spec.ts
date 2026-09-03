import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DemandPlanningService } from './demand-planning.service';
import { DemandForecast, ForecastMethod, ForecastStatus } from './entities/demand-forecast.entity';
import { ForecastPeriod } from './entities/forecast-period.entity';
import { SalesOrderLine } from '../sales/entities/sales-order-line.entity';
import { Item } from '../inventory/entities/item.entity';

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => (Array.isArray(d) ? d : { id: 'new-id', ...d })),
  findOne: jest.fn(),
  find: jest.fn(async () => []),
  update: jest.fn(async () => ({})),
  createQueryBuilder: jest.fn(),
});

const makeQb = (rawMany: any[], many: any[] = []) => ({
  innerJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getRawMany: jest.fn().mockResolvedValue(rawMany),
  getMany: jest.fn().mockResolvedValue(many),
});

const TENANT = 'tenant-1';

describe('DemandPlanningService', () => {
  let service: DemandPlanningService;
  let forecastRepo: ReturnType<typeof mockRepo>;
  let periodRepo: ReturnType<typeof mockRepo>;
  let soLineRepo: ReturnType<typeof mockRepo>;
  let itemRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    forecastRepo = mockRepo();
    periodRepo = mockRepo();
    soLineRepo = mockRepo();
    itemRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DemandPlanningService,
        { provide: getRepositoryToken(DemandForecast), useValue: forecastRepo },
        { provide: getRepositoryToken(ForecastPeriod), useValue: periodRepo },
        { provide: getRepositoryToken(SalesOrderLine), useValue: soLineRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
      ],
    }).compile();
    service = module.get(DemandPlanningService);
  });

  // ─── Algorithms ────────────────────────────────────────────────────────────────

  describe('movingAverage', () => {
    it('averages the last `window` observations', () => {
      expect(service.movingAverage([10, 20, 30, 40], 3)).toBe(30); // (20+30+40)/3
    });
    it('uses all data when window exceeds history', () => {
      expect(service.movingAverage([10, 20], 5)).toBe(15);
    });
    it('returns 0 for empty history', () => {
      expect(service.movingAverage([], 3)).toBe(0);
    });
    it('rejects a non-positive window', () => {
      expect(() => service.movingAverage([1, 2], 0)).toThrow(BadRequestException);
    });
  });

  describe('weightedMovingAverage', () => {
    it('weights recent observations more heavily', () => {
      // last 3 = [20,30,40], weights [1,2,3] → (20+60+120)/6 = 33.3333
      expect(service.weightedMovingAverage([10, 20, 30, 40], [1, 2, 3])).toBeCloseTo(33.3333, 3);
    });
    it('aligns weights when history is shorter', () => {
      // history [40], weights [1,2,3] → uses weight 3 only → 40
      expect(service.weightedMovingAverage([40], [1, 2, 3])).toBe(40);
    });
    it('rejects empty weights', () => {
      expect(() => service.weightedMovingAverage([1, 2], [])).toThrow(BadRequestException);
    });
  });

  describe('exponentialSmoothing', () => {
    it('smooths toward recent values', () => {
      // level0=10; α0.5: l1=15, l2=22.5, l3=31.25
      expect(service.exponentialSmoothing([10, 20, 30, 40], 0.5)).toBeCloseTo(31.25, 2);
    });
    it('alpha=1 tracks the last observation', () => {
      expect(service.exponentialSmoothing([10, 20, 30], 1)).toBe(30);
    });
    it('rejects an out-of-range alpha', () => {
      expect(() => service.exponentialSmoothing([1, 2], 0)).toThrow(BadRequestException);
      expect(() => service.exponentialSmoothing([1, 2], 1.5)).toThrow(BadRequestException);
    });
  });

  // ─── Accuracy ────────────────────────────────────────────────────────────────────

  describe('computeAccuracy', () => {
    it('returns null metrics when no actuals are recorded', () => {
      const result = service.computeAccuracy([
        { forecastQty: 100, adjustedQty: null, actualQty: null } as any,
      ]);
      expect(result.mape).toBeNull();
      expect(result.periodsScored).toBe(0);
    });

    it('computes MAPE and bias using the final (adjusted) quantity', () => {
      const result = service.computeAccuracy([
        { forecastQty: 100, adjustedQty: null, actualQty: 80 } as any, // ape .25, bias +20
        { forecastQty: 100, adjustedQty: 120, actualQty: 100 } as any, // ape .20, bias +20
      ]);
      expect(result.periodsScored).toBe(2);
      expect(result.mape).toBeCloseTo(22.5, 1);
      expect(result.bias).toBe(20);
    });

    it('skips periods with a zero actual', () => {
      const result = service.computeAccuracy([
        { forecastQty: 50, adjustedQty: null, actualQty: 0 } as any,
        { forecastQty: 50, adjustedQty: null, actualQty: 50 } as any,
      ]);
      expect(result.periodsScored).toBe(1);
      expect(result.mape).toBe(0);
    });
  });

  // ─── getSalesHistory ─────────────────────────────────────────────────────────────

  describe('getSalesHistory', () => {
    it('returns a continuous series, filling missing months with zero', async () => {
      soLineRepo.createQueryBuilder.mockReturnValue(makeQb([{ period: '2099-99', qty: '5' }]));
      const history = await service.getSalesHistory(TENANT, 'item-1', 6);
      expect(history).toHaveLength(6);
      // none of the generated month labels match the bogus period → all zero
      expect(history.every((h) => h.qty === 0)).toBe(true);
    });
  });

  // ─── generateForecast ────────────────────────────────────────────────────────────

  describe('generateForecast', () => {
    beforeEach(() => {
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', tenantId: TENANT, name: 'Widget' });
      soLineRepo.createQueryBuilder.mockReturnValue(
        makeQb([]), // empty history → forecast value 0, but structure still built
      );
      forecastRepo.save.mockResolvedValue({ id: 'f1', itemId: 'item-1' });
      forecastRepo.findOne.mockResolvedValue({
        id: 'f1', tenantId: TENANT, itemId: 'item-1', method: ForecastMethod.MOVING_AVERAGE,
        status: ForecastStatus.DRAFT,
      });
      periodRepo.find.mockResolvedValue([]);
    });

    it('throws when the item does not exist', async () => {
      itemRepo.findOne.mockResolvedValue(null);
      await expect(
        service.generateForecast(TENANT, { itemId: 'bad', method: ForecastMethod.MOVING_AVERAGE } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a forecast and one period per horizon month', async () => {
      await service.generateForecast(TENANT, {
        itemId: 'item-1',
        method: ForecastMethod.MOVING_AVERAGE,
        windowSize: 3,
        horizonPeriods: 6,
      } as any);
      const savedPeriods = periodRepo.save.mock.calls[0][0];
      expect(savedPeriods).toHaveLength(6);
      const savedForecast = forecastRepo.save.mock.calls[0][0];
      expect(savedForecast.parameters.windowSize).toBe(3);
      expect(savedForecast.status).toBe(ForecastStatus.DRAFT);
    });

    it('requires manualQty for the MANUAL method', async () => {
      await expect(
        service.generateForecast(TENANT, { itemId: 'item-1', method: ForecastMethod.MANUAL } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('applies the manual quantity to every period', async () => {
      await service.generateForecast(TENANT, {
        itemId: 'item-1',
        method: ForecastMethod.MANUAL,
        manualQty: 250,
        horizonPeriods: 3,
      } as any);
      const savedPeriods = periodRepo.save.mock.calls[0][0];
      expect(savedPeriods).toHaveLength(3);
      expect(savedPeriods.every((p: any) => p.forecastQty === 250)).toBe(true);
    });
  });

  // ─── adjust / actual ─────────────────────────────────────────────────────────────

  describe('adjustPeriod', () => {
    it('throws when the period is missing', async () => {
      periodRepo.findOne.mockResolvedValue(null);
      await expect(service.adjustPeriod(TENANT, 'bad', { adjustedQty: 10 })).rejects.toThrow(NotFoundException);
    });
    it('stores the manual override', async () => {
      periodRepo.findOne.mockResolvedValue({ id: 'p1', forecastQty: 100, adjustedQty: null });
      await service.adjustPeriod(TENANT, 'p1', { adjustedQty: 130 });
      expect(periodRepo.save.mock.calls[0][0].adjustedQty).toBe(130);
    });
  });

  describe('recordActual', () => {
    it('stores the realised actual', async () => {
      periodRepo.findOne.mockResolvedValue({ id: 'p1', forecastQty: 100, actualQty: null });
      await service.recordActual(TENANT, 'p1', { actualQty: 95 });
      expect(periodRepo.save.mock.calls[0][0].actualQty).toBe(95);
    });
  });

  // ─── release ─────────────────────────────────────────────────────────────────────

  describe('releaseForecast', () => {
    it('rejects releasing an archived forecast', async () => {
      forecastRepo.findOne.mockResolvedValue({ id: 'f1', status: ForecastStatus.ARCHIVED, itemId: 'item-1' });
      await expect(service.releaseForecast(TENANT, 'f1')).rejects.toThrow(BadRequestException);
    });

    it('releases periods and archives a prior released forecast for the same item', async () => {
      forecastRepo.findOne
        .mockResolvedValueOnce({ id: 'f2', status: ForecastStatus.DRAFT, itemId: 'item-1' }) // target (getForecast)
        .mockResolvedValue({ id: 'f2', status: ForecastStatus.RELEASED, itemId: 'item-1' }); // detail reload
      forecastRepo.find.mockResolvedValue([
        { id: 'f1', status: ForecastStatus.RELEASED, itemId: 'item-1' },
        { id: 'f2', status: ForecastStatus.DRAFT, itemId: 'item-1' },
      ]);
      periodRepo.find.mockResolvedValue([]);

      await service.releaseForecast(TENANT, 'f2');

      // prior f1 archived + its periods un-released
      const archivedSave = forecastRepo.save.mock.calls.find((c) => c[0].id === 'f1');
      expect(archivedSave?.[0].status).toBe(ForecastStatus.ARCHIVED);
      expect(periodRepo.update).toHaveBeenCalledWith(
        { tenantId: TENANT, forecastId: 'f1' },
        { releasedToSupply: false },
      );
      // target released
      expect(periodRepo.update).toHaveBeenCalledWith(
        { tenantId: TENANT, forecastId: 'f2' },
        { releasedToSupply: true },
      );
    });
  });

  // ─── getReleasedDemand ──────────────────────────────────────────────────────────

  describe('getReleasedDemand', () => {
    it('returns released periods using the final quantity', async () => {
      periodRepo.createQueryBuilder.mockReturnValue(
        makeQb([], [
          { itemId: 'item-1', periodLabel: '2026-07', periodStart: '2026-07-01', forecastQty: 100, adjustedQty: 120 },
          { itemId: 'item-1', periodLabel: '2026-08', periodStart: '2026-08-01', forecastQty: 100, adjustedQty: null },
        ]),
      );
      const rows = await service.getReleasedDemand(TENANT, {});
      expect(rows).toHaveLength(2);
      expect(rows[0].qty).toBe(120); // adjusted wins
      expect(rows[1].qty).toBe(100); // falls back to forecast
    });
  });
});
