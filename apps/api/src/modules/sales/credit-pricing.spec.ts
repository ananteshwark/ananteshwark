import { NotFoundException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { PricingService } from './pricing.service';
import { ConditionType, ConditionKeyType } from './entities/pricing-condition.entity';

/**
 * Credit management: check modes (OFF / WARNING / BLOCK), zero-limit
 * semantics, exposure recalculation from open AR + open orders.
 * Pricing engine: key-specificity precedence for base price, percent/amount
 * discounts and surcharges, date/quantity validity windows, net floor at 0.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  createQueryBuilder: jest.fn(),
});

describe('CreditService', () => {
  let service: CreditService;
  let customerRepo: any, invoiceRepo: any, orderRepo: any;

  beforeEach(() => {
    customerRepo = mockRepo(); invoiceRepo = mockRepo(); orderRepo = mockRepo();
    service = new CreditService(customerRepo, invoiceRepo, orderRepo);
  });

  const customer = (over: any = {}) => ({
    id: 'c1', tenantId: 't1', creditLimit: 1000, creditExposure: 800, creditCheckMode: 'WARNING', ...over,
  });

  it('OK when the order fits within the limit', async () => {
    customerRepo.findOne.mockResolvedValue(customer());
    const r = await service.checkCredit('t1', 'c1', 100);
    expect(r).toMatchObject({ status: 'OK', available: 200, limit: 1000, exposure: 800 });
  });

  it('WARNING mode warns when the limit would be exceeded', async () => {
    customerRepo.findOne.mockResolvedValue(customer());
    const r = await service.checkCredit('t1', 'c1', 300);
    expect(r.status).toBe('WARNING');
    expect(r.message).toContain('1100');
  });

  it('BLOCK mode blocks the same breach', async () => {
    customerRepo.findOne.mockResolvedValue(customer({ creditCheckMode: 'BLOCK' }));
    const r = await service.checkCredit('t1', 'c1', 300);
    expect(r.status).toBe('BLOCKED');
  });

  it('mode NONE and zero limit both bypass the check', async () => {
    customerRepo.findOne.mockResolvedValue(customer({ creditCheckMode: 'NONE' }));
    expect((await service.checkCredit('t1', 'c1', 99999)).status).toBe('OK');

    customerRepo.findOne.mockResolvedValue(customer({ creditLimit: 0 }));
    expect((await service.checkCredit('t1', 'c1', 99999)).status).toBe('OK');
  });

  it('updateExposure sums open invoices + confirmed orders and persists', async () => {
    customerRepo.findOne.mockResolvedValue(customer());
    invoiceRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ sum: '350.25' }),
    });
    orderRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ sum: '149.75' }),
    });
    const exposure = await service.updateExposure('t1', 'c1');
    expect(exposure).toBe(500);
    expect(customerRepo.save).toHaveBeenCalledWith(expect.objectContaining({ creditExposure: 500 }));
  });

  it('getCreditReport computes utilization percent per customer', async () => {
    customerRepo.find.mockResolvedValue([customer({ code: 'CUST-1', name: 'Acme' })]);
    const [row] = await service.getCreditReport('t1');
    expect(row.utilizationPct).toBe(80);
    expect(row.available).toBe(200);
  });

  it('404s for an unknown customer', async () => {
    await expect(service.checkCredit('t1', 'ghost', 1)).rejects.toThrow(NotFoundException);
  });
});

describe('PricingService', () => {
  let service: PricingService;
  let repo: any;

  beforeEach(() => {
    repo = mockRepo();
    service = new PricingService(repo);
  });

  const cond = (over: any = {}) => ({
    id: 'gen', keyType: ConditionKeyType.ALL, conditionType: ConditionType.BASE_PRICE,
    rate: 100, priority: 10, isActive: true, customerId: null, itemId: null,
    validFrom: null, validTo: null, minQty: null, maxQty: null, description: null, ...over,
  });

  it('the most specific base price wins (CUSTOMER_ITEM over ALL)', async () => {
    repo.find.mockResolvedValue([
      cond({ rate: 100 }), // ALL
      cond({ keyType: ConditionKeyType.CUSTOMER_ITEM, customerId: 'c1', itemId: 'i1', rate: 90 }),
    ]);
    const r = await service.calculatePrice('t1', { customerId: 'c1', itemId: 'i1', quantity: 1 });
    expect(r.basePrice).toBe(90);
  });

  it('applies percent discounts and amount surcharges to the net', async () => {
    repo.find.mockResolvedValue([
      cond({ rate: 200 }),
      cond({ conditionType: ConditionType.DISCOUNT_PERCENT, rate: 10 }), // -20
      cond({ conditionType: ConditionType.SURCHARGE_AMOUNT, rate: 5 }),  // +5
    ]);
    const r = await service.calculatePrice('t1', { quantity: 1 });
    expect(r).toMatchObject({ basePrice: 200, discountAmount: 20, surchargeAmount: 5, netPrice: 185 });
    expect(r.conditions).toHaveLength(3);
  });

  it('net price never goes below zero', async () => {
    repo.find.mockResolvedValue([
      cond({ rate: 50 }),
      cond({ conditionType: ConditionType.DISCOUNT_AMOUNT, rate: 80 }),
    ]);
    const r = await service.calculatePrice('t1', { quantity: 1 });
    expect(r.netPrice).toBe(0);
  });

  it('honors date-validity and quantity windows', async () => {
    repo.find.mockResolvedValue([
      cond({ rate: 100, validTo: '2020-01-01' }),           // expired
      cond({ rate: 110, minQty: 10 }),                      // needs qty >= 10
      cond({ rate: 120 }),                                  // valid fallback
    ]);
    const r = await service.calculatePrice('t1', { quantity: 5, date: '2026-07-04' });
    expect(r.basePrice).toBe(120);

    const bulk = await service.calculatePrice('t1', { quantity: 10, date: '2026-07-04' });
    expect(bulk.basePrice).toBe(110); // qty window now matches, same priority, earlier in order
  });

  it('customer-scoped conditions never leak to other customers', async () => {
    repo.find.mockResolvedValue([
      cond({ keyType: ConditionKeyType.CUSTOMER, customerId: 'vip', rate: 70 }),
    ]);
    const r = await service.calculatePrice('t1', { customerId: 'someone-else', quantity: 1 });
    expect(r.basePrice).toBe(0);
    expect(r.conditions).toHaveLength(0);
  });

  it('remove soft-deactivates instead of deleting', async () => {
    const c: any = cond({ isActive: true });
    repo.findOne.mockResolvedValue(c);
    const r = await service.remove('t1', 'p1');
    expect(c.isActive).toBe(false);
    expect(r.deleted).toBe(true);
  });
});
