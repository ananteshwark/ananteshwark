import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesOrderStatus, FulfilmentStatus } from './entities/sales-order.entity';
import { LineStatus } from './entities/sales-order-line.entity';

/**
 * Sales order lifecycle: line math (discount + tax), credit gating at
 * creation (BLOCK stops, WARNING annotates), ATP commit on confirm,
 * shipping relieving stock per line (the H3 guarantee) with partial
 * fulfilment states, completion auto-invoicing, and cancel releasing
 * committed stock.
 */
describe('SalesService', () => {
  let service: SalesService;
  let orderRepo: any, lineRepo: any, priceListRepo: any, priceListItemRepo: any;
  let arService: any, glService: any, icBillingService: any, creditService: any, atpService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 41 }),
    })),
  });

  beforeEach(() => {
    orderRepo = mockRepo(); lineRepo = mockRepo(); priceListRepo = mockRepo(); priceListItemRepo = mockRepo();
    arService = { createInvoice: jest.fn().mockResolvedValue({ id: 'ar-1' }) };
    glService = { findAccounts: jest.fn().mockResolvedValue({ items: [{ id: 'rev-acct' }] }) };
    icBillingService = { generateMirrorBill: jest.fn().mockResolvedValue({ billId: 'ic-bill-1' }) };
    creditService = { checkCredit: jest.fn().mockResolvedValue({ status: 'OK' }) };
    atpService = {
      checkATP: jest.fn().mockResolvedValue({ status: 'OK', availableQty: 100 }),
      commitForItem: jest.fn().mockResolvedValue({}),
      issueForItem: jest.fn().mockResolvedValue({}),
      releaseForItem: jest.fn().mockResolvedValue({}),
    };
    service = new SalesService(
      orderRepo, lineRepo, priceListRepo, priceListItemRepo,
      arService, glService, icBillingService, creditService, atpService,
    );
  });

  const orderDto = (over: any = {}) => ({
    customerId: 'c1', contactName: 'Acme', orderDate: '2026-07-01',
    lines: [{ itemName: 'Widget', quantity: 10, unitPrice: 100, discountPct: 10, taxPct: 18 }],
    ...over,
  });

  it('createOrder computes discounted + taxed totals and numbers the order', async () => {
    const order = await service.createOrder('t1', orderDto() as any);
    // base = 10*100*0.9 = 900; tax = 162; total = 1062
    expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      orderNumber: 'SO-000042', subtotal: 900, taxAmount: 162, total: 1062,
      status: SalesOrderStatus.DRAFT,
    }));
    expect(order.id).toBeDefined();
  });

  it('a BLOCKED credit check stops order creation; WARNING annotates it', async () => {
    creditService.checkCredit.mockResolvedValue({ status: 'BLOCKED', message: 'limit exceeded' });
    await expect(service.createOrder('t1', orderDto() as any)).rejects.toThrow(BadRequestException);

    creditService.checkCredit.mockResolvedValue({ status: 'WARNING', message: 'close to limit' });
    const order: any = await service.createOrder('t1', orderDto() as any);
    expect(order.creditWarning).toBe('close to limit');
  });

  it('confirmOrder commits ATP per line and surfaces shortfall warnings without blocking', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.DRAFT });
    lineRepo.find.mockResolvedValue([{ id: 'l1', inventoryItemId: 'i1', itemName: 'Widget', quantity: 10 }]);
    atpService.checkATP.mockResolvedValue({ status: 'INSUFFICIENT', availableQty: 4, shortfall: 6 });
    const saved: any = await service.confirmOrder('t1', 'so1');
    expect(atpService.commitForItem).toHaveBeenCalledWith('t1', 'i1', 10);
    expect(saved.status).toBe(SalesOrderStatus.CONFIRMED);
    expect(saved.atpWarnings[0]).toContain('shortfall 6');
  });

  it('shipOrder relieves inventory per line and aborts entirely on stock shortfall (H3)', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED });
    const line: any = { id: 'l1', tenantId: 't1', inventoryItemId: 'i1', quantity: 10, qtyShipped: 0 };
    lineRepo.find.mockResolvedValue([line]);

    const order = await service.shipOrder('t1', 'so1', { shippedDate: '2026-07-04' } as any);
    expect(atpService.issueForItem).toHaveBeenCalledWith('t1', 'i1', 10);
    expect(line.status).toBe(LineStatus.FULFILLED);
    expect(order.status).toBe(SalesOrderStatus.SHIPPED);
    expect(order.fulfilmentStatus).toBe(FulfilmentStatus.FULFILLED);

    // insufficient stock aborts the whole ship
    atpService.issueForItem.mockRejectedValue(new BadRequestException('Insufficient stock'));
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED });
    lineRepo.find.mockResolvedValue([{ id: 'l1', inventoryItemId: 'i1', quantity: 10, qtyShipped: 0 }]);
    await expect(service.shipOrder('t1', 'so1', { shippedDate: '2026-07-04' } as any)).rejects.toThrow('Insufficient stock');
  });

  it('partial line quantities leave the order PARTIAL', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED });
    const line: any = { id: 'l1', tenantId: 't1', inventoryItemId: 'i1', quantity: 10, qtyShipped: 0 };
    lineRepo.find.mockResolvedValue([line]);
    const order = await service.shipOrder('t1', 'so1', { shippedDate: '2026-07-04', lineQties: { l1: 4 } } as any);
    expect(atpService.issueForItem).toHaveBeenCalledWith('t1', 'i1', 4);
    expect(line.qtyShipped).toBe(4);
    expect(line.status).toBe(LineStatus.PARTIAL);
    expect(order.fulfilmentStatus).toBe(FulfilmentStatus.PARTIAL);
  });

  it('shipOrder requires CONFIRMED/IN_PROGRESS', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.DRAFT });
    await expect(service.shipOrder('t1', 'so1', { shippedDate: 'd' } as any)).rejects.toThrow(BadRequestException);
  });

  it('completeOrder auto-creates the AR invoice once and completes the order', async () => {
    const order: any = {
      id: 'so1', tenantId: 't1', status: SalesOrderStatus.SHIPPED,
      customerId: 'c1', arInvoiceId: null, orderNumber: 'SO-000001', currency: 'INR',
    };
    orderRepo.findOne.mockResolvedValue(order);
    lineRepo.find.mockResolvedValue([{ itemName: 'Widget', quantity: 10, unitPrice: 100, taxPct: 18 }]);
    const done = await service.completeOrder('t1', 'so1', 'u1');
    expect(arService.createInvoice).toHaveBeenCalledWith('t1', expect.objectContaining({
      invoiceNumber: 'INV-SO-SO-000001', customerId: 'c1',
    }));
    expect(done.arInvoiceId).toBe('ar-1');
    expect(done.status).toBe(SalesOrderStatus.COMPLETED);
  });

  it('cancelOrder releases committed stock for confirmed orders and blocks completed ones', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED });
    lineRepo.find.mockResolvedValue([{ id: 'l1', inventoryItemId: 'i1', quantity: 10 }]);
    const cancelled = await service.cancelOrder('t1', 'so1');
    expect(atpService.releaseForItem).toHaveBeenCalledWith('t1', 'i1', 10);
    expect(cancelled.status).toBe(SalesOrderStatus.CANCELLED);

    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.COMPLETED });
    await expect(service.cancelOrder('t1', 'so1')).rejects.toThrow(BadRequestException);
  });

  it('updateOrder is DRAFT-only and replaces lines with recomputed totals', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED });
    await expect(service.updateOrder('t1', 'so1', { contactName: 'X' } as any)).rejects.toThrow(BadRequestException);

    const draft: any = { id: 'so1', tenantId: 't1', status: SalesOrderStatus.DRAFT };
    orderRepo.findOne.mockResolvedValue(draft);
    await service.updateOrder('t1', 'so1', { lines: [{ itemName: 'A', quantity: 1, unitPrice: 50 }] } as any);
    expect(lineRepo.delete).toHaveBeenCalledWith({ orderId: 'so1', tenantId: 't1' });
    expect(draft.total).toBe(50);
  });

  it('lookups are tenant-scoped 404s', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.findOrder('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'x' } });
  });
});
