import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { CrpService } from './crp.service';
import { PlannedOrder, PlannedOrderType, PlannedOrderStatus } from './entities/planned-order.entity';
import { ProductionOrder, ProductionOrderStatus } from './entities/production-order.entity';
import { WorkCenter } from './entities/work-center.entity';
import { Routing } from './entities/routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { Item } from '../inventory/entities/item.entity';

const mockRepo = () => ({
  find: jest.fn(async () => []),
  findOne: jest.fn(async () => null),
});

const TENANT = 'tenant-1';

describe('CrpService (Phase 91)', () => {
  let service: CrpService;
  let plannedRepo: ReturnType<typeof mockRepo>;
  let orderRepo: ReturnType<typeof mockRepo>;
  let wcRepo: ReturnType<typeof mockRepo>;
  let routingRepo: ReturnType<typeof mockRepo>;
  let routingOpRepo: ReturnType<typeof mockRepo>;
  let itemRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    plannedRepo = mockRepo();
    orderRepo = mockRepo();
    wcRepo = mockRepo();
    routingRepo = mockRepo();
    routingOpRepo = mockRepo();
    itemRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrpService,
        { provide: getRepositoryToken(PlannedOrder), useValue: plannedRepo },
        { provide: getRepositoryToken(ProductionOrder), useValue: orderRepo },
        { provide: getRepositoryToken(WorkCenter), useValue: wcRepo },
        { provide: getRepositoryToken(Routing), useValue: routingRepo },
        { provide: getRepositoryToken(RoutingOperation), useValue: routingOpRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
      ],
    }).compile();
    service = module.get(CrpService);
  });

  // ─── Pure helpers ────────────────────────────────────────────────────────────

  describe('operationLoad', () => {
    it('multiplies run time by qty and adds one setup', () => {
      expect(service.operationLoad(2, 30, 100)).toBe(230);
    });
  });

  describe('dailyCapacity', () => {
    it('uses capacityMinutesPerDay when present', () => {
      expect(service.dailyCapacity({ capacityMinutesPerDay: 600 } as any)).toBe(600);
    });
    it('derives from capacityPerHour over 8h when minutes absent', () => {
      expect(service.dailyCapacity({ capacityPerHour: 1 } as any)).toBe(480);
    });
    it('applies efficiency percent', () => {
      expect(service.dailyCapacity({ capacityMinutesPerDay: 480, efficiencyPercent: 90 } as any)).toBe(432);
    });
  });

  describe('weekStart', () => {
    it('returns the Monday of the week', () => {
      // 2026-06-25 is a Thursday → Monday 2026-06-22
      expect(service.weekStart('2026-06-25')).toBe('2026-06-22');
    });
    it('keeps Monday as-is', () => {
      expect(service.weekStart('2026-06-22')).toBe('2026-06-22');
    });
    it('maps Sunday back to the prior Monday', () => {
      // 2026-06-28 is a Sunday → 2026-06-22
      expect(service.weekStart('2026-06-28')).toBe('2026-06-22');
    });
  });

  describe('bucketKey', () => {
    it('month bucket yields YYYY-MM', () => {
      expect(service.bucketKey('2026-06-25', 'month')).toBe('2026-06');
    });
    it('week bucket yields the Monday', () => {
      expect(service.bucketKey('2026-06-25', 'week')).toBe('2026-06-22');
    });
  });

  describe('weekdaysBetween', () => {
    it('counts Mon–Fri inclusive', () => {
      // 2026-06-22 (Mon) .. 2026-06-26 (Fri) = 5
      expect(service.weekdaysBetween('2026-06-22', '2026-06-26')).toBe(5);
    });
    it('excludes the weekend', () => {
      // full week incl weekend still 5 weekdays
      expect(service.weekdaysBetween('2026-06-22', '2026-06-28')).toBe(5);
    });
    it('returns 0 when reversed', () => {
      expect(service.weekdaysBetween('2026-06-28', '2026-06-22')).toBe(0);
    });
  });

  // ─── getCapacityPlan ─────────────────────────────────────────────────────────────

  describe('getCapacityPlan', () => {
    it('rejects a reversed date range', async () => {
      await expect(
        service.getCapacityPlan(TENANT, { from: '2026-07-01', to: '2026-06-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns an empty plan when there is no load', async () => {
      wcRepo.find.mockResolvedValue([{ id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 }]);
      const plan = await service.getCapacityPlan(TENANT, { from: '2026-06-01', to: '2026-06-30', bucket: 'month' });
      expect(plan.workCenters).toHaveLength(0);
      expect(plan.summary.totalLoadMinutes).toBe(0);
    });

    it('loads an open production order through its routing and flags overload', async () => {
      wcRepo.find.mockResolvedValue([{ id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 }]);
      itemRepo.find.mockResolvedValue([{ id: 'item-1', tenantId: TENANT, code: 'WIDGET', name: 'Widget' }]);
      orderRepo.find.mockResolvedValue([
        {
          id: 'po1', tenantId: TENANT, finishedItemCode: 'WIDGET',
          plannedQuantity: 1000, producedQuantity: 0,
          plannedStartDate: '2026-06-15', status: ProductionOrderStatus.RELEASED, workCenterId: null,
        },
      ]);
      routingRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: TENANT, itemId: 'item-1', isActive: true });
      routingOpRepo.find.mockResolvedValue([
        { id: 'op1', tenantId: TENANT, routingId: 'r1', sequence: 10, workCenterId: 'wc1', runMinutesPerUnit: 10, setupMinutes: 60 },
      ]);
      plannedRepo.find.mockResolvedValue([]);

      const plan = await service.getCapacityPlan(TENANT, { from: '2026-06-01', to: '2026-06-30', bucket: 'month' });

      expect(plan.workCenters).toHaveLength(1);
      const wc = plan.workCenters[0];
      // load = 10*1000 + 60 = 10060; capacity = 480 * 22 weekdays in June 2026 = 10560
      expect(wc.cells[0].loadMinutes).toBe(10060);
      expect(wc.cells[0].availableMinutes).toBe(10560);
      expect(wc.cells[0].overloaded).toBe(false);
    });

    it('includes planned production orders and detects a bottleneck', async () => {
      wcRepo.find.mockResolvedValue([{ id: 'wc1', name: 'Press', capacityMinutesPerDay: 480 }]);
      itemRepo.find.mockResolvedValue([{ id: 'item-1', tenantId: TENANT, code: 'GEAR', name: 'Gear' }]);
      orderRepo.find.mockResolvedValue([]);
      plannedRepo.find.mockResolvedValue([
        {
          id: 'pl1', tenantId: TENANT, itemId: 'item-1', itemName: 'Gear',
          type: PlannedOrderType.PLANNED_PRODUCTION, status: PlannedOrderStatus.PLANNED,
          quantity: 5000, dueDate: '2026-06-15',
        },
      ]);
      routingRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: TENANT, itemId: 'item-1', isActive: true });
      routingOpRepo.find.mockResolvedValue([
        { id: 'op1', tenantId: TENANT, routingId: 'r1', sequence: 10, workCenterId: 'wc1', runMinutesPerUnit: 5, setupMinutes: 0 },
      ]);

      const plan = await service.getCapacityPlan(TENANT, { from: '2026-06-01', to: '2026-06-30', bucket: 'month' });

      // load = 5*5000 = 25000 > 10560 capacity → overloaded bottleneck
      expect(plan.workCenters[0].cells[0].loadMinutes).toBe(25000);
      expect(plan.workCenters[0].cells[0].overloaded).toBe(true);
      expect(plan.summary.overloadedCells).toBe(1);
      expect(plan.summary.bottleneckWorkCenters).toHaveLength(1);
      expect(plan.summary.bottleneckWorkCenters[0].workCenterName).toBe('Press');
    });

    it('excludes planned orders when includePlanned is false', async () => {
      wcRepo.find.mockResolvedValue([{ id: 'wc1', name: 'Press', capacityMinutesPerDay: 480 }]);
      itemRepo.find.mockResolvedValue([{ id: 'item-1', tenantId: TENANT, code: 'GEAR', name: 'Gear' }]);
      orderRepo.find.mockResolvedValue([]);
      plannedRepo.find.mockResolvedValue([
        {
          id: 'pl1', tenantId: TENANT, itemId: 'item-1', type: PlannedOrderType.PLANNED_PRODUCTION,
          status: PlannedOrderStatus.PLANNED, quantity: 5000, dueDate: '2026-06-15',
        },
      ]);

      const plan = await service.getCapacityPlan(TENANT, {
        from: '2026-06-01', to: '2026-06-30', bucket: 'month', includePlanned: false,
      });
      expect(plan.workCenters).toHaveLength(0);
      expect(plannedRepo.find).not.toHaveBeenCalled();
    });

    it('ignores orders whose start date is outside the window', async () => {
      wcRepo.find.mockResolvedValue([{ id: 'wc1', name: 'CNC', capacityMinutesPerDay: 480 }]);
      itemRepo.find.mockResolvedValue([{ id: 'item-1', code: 'WIDGET', name: 'Widget' }]);
      orderRepo.find.mockResolvedValue([
        {
          id: 'po1', finishedItemCode: 'WIDGET', plannedQuantity: 100, producedQuantity: 0,
          plannedStartDate: '2026-12-31', status: ProductionOrderStatus.RELEASED, workCenterId: null,
        },
      ]);
      plannedRepo.find.mockResolvedValue([]);

      const plan = await service.getCapacityPlan(TENANT, { from: '2026-06-01', to: '2026-06-30', bucket: 'month' });
      expect(plan.workCenters).toHaveLength(0);
    });
  });
});
