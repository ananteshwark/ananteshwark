import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FulfillmentOrchestrationService } from './fulfillment-orchestration.service';
import { SupplyLink, SupplyType, SupplyDocType, SupplyLinkStatus } from './entities/supply-link.entity';
import { SalesOrder } from '../entities/sales-order.entity';
import { SalesOrderLine, LineStatus } from '../entities/sales-order-line.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'link-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'link-1', ...x })),
});

describe('FulfillmentOrchestrationService — Phase 145-146', () => {
  let service: FulfillmentOrchestrationService;
  let linkRepo: any, orderRepo: any, lineRepo: any;

  beforeEach(async () => {
    linkRepo = mockRepo(); orderRepo = mockRepo(); lineRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        FulfillmentOrchestrationService,
        { provide: getRepositoryToken(SupplyLink), useValue: linkRepo },
        { provide: getRepositoryToken(SalesOrder), useValue: orderRepo },
        { provide: getRepositoryToken(SalesOrderLine), useValue: lineRepo },
      ],
    }).compile();
    service = module.get(FulfillmentOrchestrationService);
  });

  // ─── create ───────────────────────────────────────────────────────

  it('createSupplyLink — drop-ship defaults qty to remaining and tags line', async () => {
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 100, qtyShipped: 20, inventoryItemId: 'item1' });
    linkRepo.findOne.mockResolvedValue(null);
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));

    const link = await service.createSupplyLink('t1', { salesOrderLineId: 'l1', supplyType: SupplyType.DROP_SHIP, vendorId: 'v1' });
    expect(linkRepo.create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 80, supplyType: 'DROP_SHIP', salesOrderId: 'so1', itemId: 'item1' }));
    expect(link.id).toBe('link-1');
    // line tagged
    expect(lineRepo.save).toHaveBeenCalledWith(expect.objectContaining({ fulfillmentType: 'DROP_SHIP' }));
  });

  it('createSupplyLink — rejects when line not found', async () => {
    lineRepo.findOne.mockResolvedValue(null);
    await expect(service.createSupplyLink('t1', { salesOrderLineId: 'nope', supplyType: SupplyType.DROP_SHIP })).rejects.toThrow(NotFoundException);
  });

  it('createSupplyLink — rejects duplicate open link', async () => {
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 100, qtyShipped: 0 });
    linkRepo.findOne.mockResolvedValue({ id: 'existing', status: SupplyLinkStatus.REQUESTED });
    await expect(service.createSupplyLink('t1', { salesOrderLineId: 'l1', supplyType: SupplyType.DROP_SHIP })).rejects.toThrow(BadRequestException);
  });

  it('createSupplyLink — rejects when nothing left to supply', async () => {
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 100, qtyShipped: 100 });
    linkRepo.findOne.mockResolvedValue(null);
    await expect(service.createSupplyLink('t1', { salesOrderLineId: 'l1', supplyType: SupplyType.DROP_SHIP })).rejects.toThrow(BadRequestException);
  });

  // ─── markOrdered ──────────────────────────────────────────────────

  it('markOrdered — attaches supply doc and moves to ORDERED', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.REQUESTED });
    linkRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const link = await service.markOrdered('t1', 'link-1', { supplyDocType: SupplyDocType.PURCHASE_ORDER, supplyDocId: 'po1', supplyDocNumber: 'PO-1' });
    expect(link.status).toBe(SupplyLinkStatus.ORDERED);
    expect(link.supplyDocId).toBe('po1');
  });

  it('markOrdered — rejects non-requested', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.ORDERED });
    await expect(service.markOrdered('t1', 'link-1', { supplyDocType: SupplyDocType.PURCHASE_ORDER, supplyDocId: 'po1' })).rejects.toThrow(BadRequestException);
  });

  // ─── receive ──────────────────────────────────────────────────────

  it('receiveSupply — drop-ship relieves SO line and fulfils', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.ORDERED, supplyType: SupplyType.DROP_SHIP, quantity: 80, fulfilledQty: 0, salesOrderLineId: 'l1', salesOrderId: 'so1' });
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 100, qtyShipped: 20 });
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    linkRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    orderRepo.findOne.mockResolvedValue({ id: 'so1' });
    lineRepo.find.mockResolvedValue([{ id: 'l1', status: LineStatus.FULFILLED, qtyShipped: 100 }]);
    orderRepo.save.mockImplementation((x: any) => Promise.resolve(x));

    const { link, line } = await service.receiveSupply('t1', 'link-1', 80);
    expect(line.qtyShipped).toBe(100);
    expect(line.status).toBe(LineStatus.FULFILLED);
    expect(link.status).toBe(SupplyLinkStatus.FULFILLED);
  });

  it('receiveSupply — back-to-back does NOT auto-ship the line', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.ORDERED, supplyType: SupplyType.BACK_TO_BACK, quantity: 50, fulfilledQty: 0, salesOrderLineId: 'l1', salesOrderId: 'so1' });
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 50, qtyShipped: 0 });
    linkRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const { link, line } = await service.receiveSupply('t1', 'link-1', 50);
    expect(line.qtyShipped).toBe(0); // stock replenished, ships via normal delivery
    expect(link.status).toBe(SupplyLinkStatus.RECEIVED);
  });

  it('receiveSupply — partial drop-ship marks line PARTIAL', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.ORDERED, supplyType: SupplyType.DROP_SHIP, quantity: 80, fulfilledQty: 0, salesOrderLineId: 'l1', salesOrderId: 'so1' });
    lineRepo.findOne.mockResolvedValue({ id: 'l1', orderId: 'so1', quantity: 100, qtyShipped: 0 });
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    linkRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    orderRepo.findOne.mockResolvedValue({ id: 'so1' });
    lineRepo.find.mockResolvedValue([{ id: 'l1', status: LineStatus.PARTIAL, qtyShipped: 40 }]);
    orderRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const { link, line } = await service.receiveSupply('t1', 'link-1', 40);
    expect(line.status).toBe(LineStatus.PARTIAL);
    expect(link.status).toBe(SupplyLinkStatus.RECEIVED); // 40 of 80
  });

  it('receiveSupply — rejects over-receipt', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.ORDERED, supplyType: SupplyType.DROP_SHIP, quantity: 80, fulfilledQty: 80 });
    await expect(service.receiveSupply('t1', 'link-1', 10)).rejects.toThrow(BadRequestException);
  });

  it('cancelLink — rejects fulfilled', async () => {
    linkRepo.findOne.mockResolvedValue({ id: 'link-1', status: SupplyLinkStatus.FULFILLED });
    await expect(service.cancelLink('t1', 'link-1')).rejects.toThrow(BadRequestException);
  });
});
