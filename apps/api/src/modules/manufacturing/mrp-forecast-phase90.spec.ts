import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MrpService } from './mrp.service';
import { PlannedOrder, PlannedOrderType } from './entities/planned-order.entity';
import { Item } from '../inventory/entities/item.entity';
import { StockBalance } from '../inventory/entities/stock-balance.entity';
import { ProductionOrder } from './entities/production-order.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { SalesOrderLine } from '../sales/entities/sales-order-line.entity';
import { Bom } from './entities/bom.entity';
import { ManufacturingService } from './manufacturing.service';
import { DemandPlanningService } from '../planning/demand-planning.service';

const mockRepo = () => ({
  create: jest.fn((d) => d),
  save: jest.fn(async (d) => (Array.isArray(d) ? d : { id: 'po-new', ...d })),
  find: jest.fn(async () => []),
  findOne: jest.fn(),
  delete: jest.fn(async () => ({})),
});

const TENANT = 'tenant-1';

const makeItem = (over: Partial<Item> = {}): any => ({
  id: 'item-1',
  tenantId: TENANT,
  code: 'WIDGET',
  name: 'Widget',
  isActive: true,
  reorderPoint: 0,
  reorderLevel: 0,
  safetyStock: 0,
  reorderQty: 0,
  procurementType: 'BUY',
  plannedDeliveryDays: 7,
  ...over,
});

describe('MrpService — forecast integration (Phase 90)', () => {
  let service: MrpService;
  let plannedRepo: ReturnType<typeof mockRepo>;
  let itemRepo: ReturnType<typeof mockRepo>;
  let balanceRepo: ReturnType<typeof mockRepo>;
  let orderRepo: ReturnType<typeof mockRepo>;
  let soRepo: ReturnType<typeof mockRepo>;
  let soLineRepo: ReturnType<typeof mockRepo>;
  let bomRepo: ReturnType<typeof mockRepo>;
  let demandPlanning: { getReleasedDemand: jest.Mock };

  beforeEach(async () => {
    plannedRepo = mockRepo();
    itemRepo = mockRepo();
    balanceRepo = mockRepo();
    orderRepo = mockRepo();
    soRepo = mockRepo();
    soLineRepo = mockRepo();
    bomRepo = mockRepo();
    demandPlanning = { getReleasedDemand: jest.fn(async () => []) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MrpService,
        { provide: getRepositoryToken(PlannedOrder), useValue: plannedRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(StockBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(ProductionOrder), useValue: orderRepo },
        { provide: getRepositoryToken(SalesOrder), useValue: soRepo },
        { provide: getRepositoryToken(SalesOrderLine), useValue: soLineRepo },
        { provide: getRepositoryToken(Bom), useValue: bomRepo },
        { provide: ManufacturingService, useValue: {} },
        { provide: DemandPlanningService, useValue: demandPlanning },
      ],
    }).compile();
    service = module.get(MrpService);
  });

  // ─── netForecast (forecast consumption) ──────────────────────────────────────

  describe('netForecast', () => {
    it('returns the uncovered forecast when it exceeds firm orders', () => {
      expect(service.netForecast(100, 30)).toBe(70);
    });
    it('returns zero when firm orders already exceed the forecast', () => {
      expect(service.netForecast(100, 120)).toBe(0);
    });
    it('returns the full forecast when there are no firm orders', () => {
      expect(service.netForecast(80, 0)).toBe(80);
    });
  });

  // ─── runMrp forecast integration ─────────────────────────────────────────────

  it('creates a planned order from forecast-only demand', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    demandPlanning.getReleasedDemand.mockResolvedValue([
      { itemId: 'item-1', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 50 },
    ]);

    const result = await service.runMrp(TENANT, { horizonDays: 3650 });

    expect(demandPlanning.getReleasedDemand).toHaveBeenCalled();
    expect(result.forecastItemsApplied).toBe(1);
    expect(result.plannedOrdersCreated).toBe(1);
    const saved = plannedRepo.save.mock.calls[0][0];
    expect(saved.itemId).toBe('item-1');
    expect(saved.quantity).toBe(50);
    expect(saved.type).toBe(PlannedOrderType.PLANNED_PO);
    expect(saved.sourceDemand).toContain('Forecast');
  });

  it('nets forecast against firm sales-order demand (no double count)', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    // firm SO demand of 30 for the item
    soRepo.find.mockResolvedValue([
      { id: 'so-1', tenantId: TENANT, orderNumber: 'SO-1', status: 'CONFIRMED', expectedDeliveryDate: null },
    ]);
    soLineRepo.find.mockResolvedValue([
      { tenantId: TENANT, orderId: 'so-1', inventoryItemId: 'item-1', quantity: 30, qtyShipped: 0, status: 'PENDING' },
    ]);
    demandPlanning.getReleasedDemand.mockResolvedValue([
      { itemId: 'item-1', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 100 },
    ]);

    const result = await service.runMrp(TENANT, { horizonDays: 3650 });

    // total demand = 30 firm + 70 net forecast = 100 → planned order qty 100
    const saved = plannedRepo.save.mock.calls[0][0];
    expect(saved.quantity).toBe(100);
    expect(result.forecastItemsApplied).toBe(1);
  });

  it('adds no forecast demand when firm orders already cover it', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    soRepo.find.mockResolvedValue([
      { id: 'so-1', tenantId: TENANT, orderNumber: 'SO-1', status: 'CONFIRMED', expectedDeliveryDate: null },
    ]);
    soLineRepo.find.mockResolvedValue([
      { tenantId: TENANT, orderId: 'so-1', inventoryItemId: 'item-1', quantity: 100, qtyShipped: 0, status: 'PENDING' },
    ]);
    demandPlanning.getReleasedDemand.mockResolvedValue([
      { itemId: 'item-1', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 60 },
    ]);

    const result = await service.runMrp(TENANT, { horizonDays: 3650 });

    // demand stays 100 (forecast fully consumed); still one planned order of 100
    const saved = plannedRepo.save.mock.calls[0][0];
    expect(saved.quantity).toBe(100);
    expect(result.forecastItemsApplied).toBe(0);
  });

  it('skips forecast when includeForecast is false', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    demandPlanning.getReleasedDemand.mockResolvedValue([
      { itemId: 'item-1', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 50 },
    ]);

    const result = await service.runMrp(TENANT, { horizonDays: 3650, includeForecast: false });

    expect(demandPlanning.getReleasedDemand).not.toHaveBeenCalled();
    expect(result.forecastItemsApplied).toBe(0);
    expect(result.plannedOrdersCreated).toBe(0);
  });

  it('ignores released demand for unknown items', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    demandPlanning.getReleasedDemand.mockResolvedValue([
      { itemId: 'ghost-item', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 999 },
    ]);

    const result = await service.runMrp(TENANT, { horizonDays: 3650 });

    expect(result.forecastItemsApplied).toBe(0);
    expect(result.plannedOrdersCreated).toBe(0);
  });

  it('does not fail MRP when demand planning throws', async () => {
    itemRepo.find.mockResolvedValue([makeItem()]);
    demandPlanning.getReleasedDemand.mockRejectedValue(new Error('planning down'));

    const result = await service.runMrp(TENANT, { horizonDays: 3650 });

    expect(result.forecastItemsApplied).toBe(0);
    expect(result.plannedOrdersCreated).toBe(0);
  });

  // ─── getStockRequirements ─────────────────────────────────────────────────────

  describe('getStockRequirements', () => {
    it('includes netted forecast demand in the projection', async () => {
      itemRepo.findOne.mockResolvedValue(makeItem());
      balanceRepo.find.mockResolvedValue([{ tenantId: TENANT, itemId: 'item-1', qtyOnHand: 200, committedQty: 0 }]);
      orderRepo.find.mockResolvedValue([]);
      soRepo.find.mockResolvedValue([]);
      soLineRepo.find.mockResolvedValue([]);
      plannedRepo.find.mockResolvedValue([]);
      demandPlanning.getReleasedDemand.mockResolvedValue([
        { itemId: 'item-1', periodLabel: '2099-01', periodStart: '2099-01-01', qty: 50 },
        { itemId: 'item-1', periodLabel: '2099-02', periodStart: '2099-02-01', qty: 30 },
      ]);

      const req = await service.getStockRequirements(TENANT, 'item-1');

      expect(req.forecastDemand).toBe(80);
      expect(req.netForecastDemand).toBe(80); // no firm demand
      expect(req.projectedAvailable).toBe(120); // 200 on hand - 80 forecast
    });
  });
});
