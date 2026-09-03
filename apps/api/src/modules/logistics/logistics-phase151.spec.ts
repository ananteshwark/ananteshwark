import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LogisticsService } from './logistics.service';
import { SequenceService } from '../../common/sequence/sequence.service';
import { Carrier } from './entities/carrier.entity';

const seqMock = () => ({
  next: jest.fn().mockResolvedValue(1),
  formatted: jest.fn((_t: string, _k: string, prefix: string, pad = 6) => Promise.resolve(`${prefix}${String(1).padStart(pad, '0')}`)),
});
import { FreightRate } from './entities/freight-rate.entity';
import { ShipmentPlan, ShipmentPlanStatus } from './entities/shipment-plan.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('LogisticsService — Phase 151-154', () => {
  let service: LogisticsService;
  let carrierRepo: any, rateRepo: any, planRepo: any;

  beforeEach(async () => {
    carrierRepo = mockRepo(); rateRepo = mockRepo(); planRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        LogisticsService,
        { provide: SequenceService, useValue: seqMock() },
        { provide: getRepositoryToken(Carrier), useValue: carrierRepo },
        { provide: getRepositoryToken(FreightRate), useValue: rateRepo },
        { provide: getRepositoryToken(ShipmentPlan), useValue: planRepo },
      ],
    }).compile();
    service = module.get(LogisticsService);
  });

  // ─── Ph-151 ───────────────────────────────────────────────────────

  it('createCarrier — rejects duplicate', async () => {
    carrierRepo.findOne.mockResolvedValue({ id: 'c1' });
    await expect(service.createCarrier('t1', { code: 'FEDEX' })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-152: rate compute + shopping ──────────────────────────────

  it('computeRateCost — flat + perKg + fuel, floored at minCharge', () => {
    const rate = { flatRate: 10, ratePerKg: 2, fuelSurchargePct: 10, minCharge: 0 } as FreightRate;
    // (10 + 2*50) * 1.1 = 121
    expect(service.computeRateCost(rate, 50)).toBe(121);
  });

  it('computeRateCost — applies min charge floor', () => {
    const rate = { flatRate: 0, ratePerKg: 1, fuelSurchargePct: 0, minCharge: 50 } as FreightRate;
    expect(service.computeRateCost(rate, 10)).toBe(50); // 10 < 50 floor
  });

  it('rateShop — returns quotes cheapest first within weight band', async () => {
    rateRepo.find.mockResolvedValue([
      { id: 'r1', carrierId: 'c1', minWeight: 0, maxWeight: 100, flatRate: 20, ratePerKg: 1, fuelSurchargePct: 0, minCharge: 0, currency: 'USD' },
      { id: 'r2', carrierId: 'c2', minWeight: 0, maxWeight: 100, flatRate: 5, ratePerKg: 1, fuelSurchargePct: 0, minCharge: 0, currency: 'USD' },
    ]);
    carrierRepo.find.mockResolvedValue([
      { id: 'c1', code: 'FEDEX', name: 'FedEx', serviceLevel: 'EXPRESS', transitDays: 1, isActive: true },
      { id: 'c2', code: 'USPS', name: 'USPS', serviceLevel: 'STANDARD', transitDays: 5, isActive: true },
    ]);
    const quotes = await service.rateShop('t1', { originZone: 'Z1', destZone: 'Z2', weight: 50 });
    expect(quotes).toHaveLength(2);
    expect(quotes[0].carrierCode).toBe('USPS'); // 55 < 70
    expect(quotes[0].cost).toBe(55);
    expect(quotes[1].cost).toBe(70);
  });

  it('rateShop — excludes rates outside the weight band', async () => {
    rateRepo.find.mockResolvedValue([
      { id: 'r1', carrierId: 'c1', minWeight: 100, maxWeight: 200, flatRate: 5, ratePerKg: 1, fuelSurchargePct: 0, minCharge: 0, currency: 'USD' },
    ]);
    carrierRepo.find.mockResolvedValue([{ id: 'c1', code: 'X', name: 'X', isActive: true }]);
    const quotes = await service.rateShop('t1', { originZone: 'Z1', destZone: 'Z2', weight: 50 });
    expect(quotes).toHaveLength(0);
  });

  it('rateShop — rejects non-positive weight', async () => {
    await expect(service.rateShop('t1', { originZone: 'Z1', destZone: 'Z2', weight: 0 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-153: shipment planning ────────────────────────────────────

  it('planShipment — auto-selects cheapest carrier and computes utilization', async () => {
    rateRepo.find.mockResolvedValue([
      { id: 'r1', carrierId: 'c1', minWeight: 0, maxWeight: 1000, flatRate: 100, ratePerKg: 0, fuelSurchargePct: 0, minCharge: 0, currency: 'USD' },
      { id: 'r2', carrierId: 'c2', minWeight: 0, maxWeight: 1000, flatRate: 80, ratePerKg: 0, fuelSurchargePct: 0, minCharge: 0, currency: 'USD' },
    ]);
    carrierRepo.find.mockResolvedValue([
      { id: 'c1', code: 'A', name: 'A', isActive: true, transitDays: 2, serviceLevel: 'STD' },
      { id: 'c2', code: 'B', name: 'B', isActive: true, transitDays: 3, serviceLevel: 'STD' },
    ]);
    planRepo.count.mockResolvedValue(0);
    const plan = await service.planShipment('t1', {
      deliveryIds: ['d1', 'd2'], originZone: 'Z1', destZone: 'Z2', totalWeight: 500, totalVolume: 8, weightCapacity: 1000, volumeCapacity: 10,
    });
    expect(planRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      carrierId: 'c2', plannedFreightCost: 80, weightUtilizationPct: 50, volumeUtilizationPct: 80, shipmentNumber: 'SHP-000001',
    }));
    expect(plan.id).toBe('gen-1');
  });

  it('planShipment — rejects overweight vs capacity', async () => {
    rateRepo.find.mockResolvedValue([]);
    carrierRepo.find.mockResolvedValue([]);
    await expect(service.planShipment('t1', {
      deliveryIds: ['d1'], originZone: 'Z1', destZone: 'Z2', totalWeight: 1500, weightCapacity: 1000,
    })).rejects.toThrow(BadRequestException);
  });

  it('planShipment — rejects empty deliveries', async () => {
    await expect(service.planShipment('t1', { deliveryIds: [], originZone: 'Z1', destZone: 'Z2', totalWeight: 100 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-154: freight audit ────────────────────────────────────────

  it('freightAudit — within tolerance → APPROVE', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', shipmentNumber: 'SHP-1', plannedFreightCost: 100 });
    planRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.freightAudit('t1', 'p1', 103, 5);
    expect(r.variance).toBe(3);
    expect(r.variancePct).toBe(3);
    expect(r.withinTolerance).toBe(true);
    expect(r.recommendation).toBe('APPROVE');
  });

  it('freightAudit — out of tolerance → DISPUTE', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', shipmentNumber: 'SHP-1', plannedFreightCost: 100 });
    planRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.freightAudit('t1', 'p1', 130, 5);
    expect(r.recommendation).toBe('DISPUTE');
  });

  it('freightAudit — throws on missing plan', async () => {
    planRepo.findOne.mockResolvedValue(null);
    await expect(service.freightAudit('t1', 'nope', 100)).rejects.toThrow(NotFoundException);
  });
});
