import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryStatus } from './entities/delivery-order.entity';
import { SalesOrderStatus, FulfilmentStatus } from './entities/sales-order.entity';

/**
 * Delivery lifecycle: creation snapshots order lines, DRAFT → PICKED →
 * SHIPPED (goods issue deducts stock + releases ATP + advances the SO) →
 * DELIVERED on POD, with cancel guards.
 */
describe('DeliveryService', () => {
  let service: DeliveryService;
  let deliveryRepo: any, lineRepo: any, orderRepo: any, orderLineRepo: any, inventoryService: any, atpService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 2 }),
    })),
  });

  beforeEach(() => {
    deliveryRepo = mockRepo(); lineRepo = mockRepo(); orderRepo = mockRepo(); orderLineRepo = mockRepo();
    inventoryService = { issueStock: jest.fn().mockResolvedValue({}) };
    atpService = { releaseForItem: jest.fn().mockResolvedValue({}) };
    service = new DeliveryService(deliveryRepo, lineRepo, orderRepo, orderLineRepo, inventoryService, atpService);
  });

  it('createFromSalesOrder numbers the delivery and snapshots the order lines', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'so1', tenantId: 't1', customerId: 'c1', contactName: 'Acme' });
    orderLineRepo.find.mockResolvedValue([
      { id: 'sol1', lineNumber: 1, inventoryItemId: 'i1', itemName: 'Widget', quantity: 5 },
    ]);
    const d = await service.createFromSalesOrder('t1', 'so1', {});
    expect(d.deliveryNumber).toBe('DEL-0003');
    expect(d.status).toBe(DeliveryStatus.DRAFT);
    expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      salesOrderLineId: 'sol1', orderedQty: 5, deliveredQty: 5,
    }));
  });

  it('pick requires DRAFT; goodsIssue requires PICKED', async () => {
    deliveryRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', status: DeliveryStatus.SHIPPED });
    await expect(service.pick('t1', 'd1')).rejects.toThrow(BadRequestException);
    await expect(service.goodsIssue('t1', 'd1')).rejects.toThrow(BadRequestException);
  });

  it('goodsIssue deducts stock, releases ATP, ships, and advances the sales order', async () => {
    const delivery: any = {
      id: 'd1', tenantId: 't1', status: DeliveryStatus.PICKED, salesOrderId: 'so1',
      warehouseId: 'wh1', deliveryDate: '2026-07-04', deliveryNumber: 'DEL-0001',
    };
    deliveryRepo.findOne.mockResolvedValue(delivery);
    lineRepo.find.mockResolvedValue([{ itemId: 'i1', deliveredQty: 5, warehouseId: null }]);
    const order: any = { id: 'so1', tenantId: 't1', status: SalesOrderStatus.CONFIRMED, shippedDate: null };
    orderRepo.findOne.mockResolvedValue(order);

    await service.goodsIssue('t1', 'd1');
    expect(inventoryService.issueStock).toHaveBeenCalledWith(
      't1', 'i1', 'wh1', 5, 'DELIVERY', 'd1', '2026-07-04', expect.any(String));
    expect(atpService.releaseForItem).toHaveBeenCalledWith('t1', 'i1', 5);
    expect(delivery.status).toBe(DeliveryStatus.SHIPPED);
    expect(order.status).toBe(SalesOrderStatus.SHIPPED);
    expect(order.fulfilmentStatus).toBe(FulfilmentStatus.FULFILLED);
    expect(order.shippedDate).toBe('2026-07-04');
  });

  it('goodsIssue survives a stock failure (best-effort) and still ships', async () => {
    inventoryService.issueStock.mockRejectedValue(new Error('no stock'));
    const delivery: any = { id: 'd1', tenantId: 't1', status: DeliveryStatus.PICKED, salesOrderId: 'so1', warehouseId: 'wh1', deliveryDate: '2026-07-04' };
    deliveryRepo.findOne.mockResolvedValue(delivery);
    lineRepo.find.mockResolvedValue([{ itemId: 'i1', deliveredQty: 5, warehouseId: 'wh1' }]);
    orderRepo.findOne.mockResolvedValue(null);
    const d = await service.goodsIssue('t1', 'd1');
    expect(d.status).toBe(DeliveryStatus.SHIPPED);
  });

  it('confirmPod requires SHIPPED, stamps POD, and completes the SO', async () => {
    deliveryRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', status: DeliveryStatus.PICKED });
    await expect(service.confirmPod('t1', 'd1', {})).rejects.toThrow(BadRequestException);

    const delivery: any = { id: 'd1', tenantId: 't1', status: DeliveryStatus.SHIPPED, salesOrderId: 'so1' };
    deliveryRepo.findOne.mockResolvedValue(delivery);
    const order: any = { id: 'so1', tenantId: 't1', status: SalesOrderStatus.SHIPPED };
    orderRepo.findOne.mockResolvedValue(order);
    await service.confirmPod('t1', 'd1', { note: 'received by security' });
    expect(delivery.status).toBe(DeliveryStatus.DELIVERED);
    expect(delivery.podConfirmedAt).toBeInstanceOf(Date);
    expect(delivery.podNote).toBe('received by security');
    expect(order.status).toBe(SalesOrderStatus.COMPLETED);
  });

  it('cancel refuses delivered/cancelled deliveries', async () => {
    deliveryRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', status: DeliveryStatus.DELIVERED });
    await expect(service.cancel('t1', 'd1')).rejects.toThrow(BadRequestException);
    deliveryRepo.findOne.mockResolvedValue(null);
    await expect(service.cancel('t1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
