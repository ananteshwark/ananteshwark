import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SpecialProcurementService } from './special-procurement.service';
import { SubcontractStatus } from './entities/subcontract-order.entity';
import { ConsignmentStatus } from './entities/consignment-stock.entity';
import { StoStatus } from './entities/stock-transfer-order.entity';

/**
 * Special procurement:
 * - Subcontracting: components issued out, finished goods received back at
 *   material + conversion cost, strict stage ordering.
 * - Consignment: consumption/return capped at the available balance with
 *   status progression.
 * - Stock transfer orders: DRAFT → APPROVED → issued → received → completed,
 *   moving stock between warehouses.
 */
describe('SpecialProcurementService', () => {
  let service: SpecialProcurementService;
  let scRepo: any, consignmentRepo: any, stoRepo: any, inventoryService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    scRepo = mockRepo(); consignmentRepo = mockRepo(); stoRepo = mockRepo();
    inventoryService = {
      issueStock: jest.fn().mockResolvedValue({}),
      receiveStock: jest.fn().mockResolvedValue({}),
      getStockBalance: jest.fn().mockResolvedValue([{ avgCost: 12.5 }]),
    };
    service = new SpecialProcurementService(scRepo, consignmentRepo, stoRepo, inventoryService);
  });

  // ─── Subcontracting ─────────────────────────────────────────────

  const scOrder = (over: any = {}) => ({
    id: 'sc1', tenantId: 't1', scNumber: 'SC-00001', status: SubcontractStatus.DRAFT,
    itemId: 'fin-item', finishedQty: 10, unitConversionCost: 2,
    sendingWarehouseId: 'wh-a', receivingWarehouseId: 'wh-b',
    components: [{ itemId: 'raw1', qty: 20, unitCost: 3 }, { itemId: 'raw2', qty: 10, unitCost: 4 }],
    ...over,
  });

  it('sendComponents issues each component from the sending warehouse (DRAFT only)', async () => {
    scRepo.findOne.mockResolvedValue(scOrder({ status: SubcontractStatus.COMPLETED }));
    await expect(service.sendComponents('t1', 'sc1')).rejects.toThrow(BadRequestException);

    const sc: any = scOrder();
    scRepo.findOne.mockResolvedValue(sc);
    await service.sendComponents('t1', 'sc1', '2026-07-04');
    expect(inventoryService.issueStock).toHaveBeenCalledTimes(2);
    expect(inventoryService.issueStock).toHaveBeenCalledWith(
      't1', 'raw1', 'wh-a', 20, 'SUBCONTRACT', 'sc1', '2026-07-04', expect.any(String));
    expect(sc.status).toBe(SubcontractStatus.COMPONENTS_SENT);
  });

  it('receiveFinishedGoods costs the output at material + conversion cost', async () => {
    const sc: any = scOrder({ status: SubcontractStatus.COMPONENTS_SENT });
    scRepo.findOne.mockResolvedValue(sc);
    await service.receiveFinishedGoods('t1', 'sc1', '2026-07-05');
    // material = 20*3 + 10*4 = 100 → 100/10 + 2 conversion = 12/unit
    expect(inventoryService.receiveStock).toHaveBeenCalledWith(
      't1', 'fin-item', 'wh-b', 10, 12, 'SUBCONTRACT', 'sc1', '2026-07-05', expect.any(String));
    expect(sc.status).toBe(SubcontractStatus.FINISHED_RECEIVED);
  });

  it('the subcontract stages enforce strict ordering', async () => {
    scRepo.findOne.mockResolvedValue(scOrder({ status: SubcontractStatus.DRAFT }));
    await expect(service.receiveFinishedGoods('t1', 'sc1')).rejects.toThrow('Components must be sent');
    await expect(service.completeSubcontractOrder('t1', 'sc1')).rejects.toThrow('must be received');
  });

  // ─── Consignment ────────────────────────────────────────────────

  const consignment = (over: any = {}) => ({
    id: 'cs1', tenantId: 't1', itemId: 'i1', warehouseId: 'wh1', vendorId: 'v1',
    qtyReceived: 100, qtyConsumed: 30, qtyReturned: 20, unitCost: 5,
    status: ConsignmentStatus.ACTIVE, ...over,
  });

  it('consumeConsignment caps at the available balance and books stock in', async () => {
    consignmentRepo.findOne.mockResolvedValue(consignment());
    // available = 100 - 30 - 20 = 50
    await expect(service.consumeConsignment('t1', 'cs1', 51)).rejects.toThrow('Only 50 units');

    const cs: any = consignment();
    consignmentRepo.findOne.mockResolvedValue(cs);
    await service.consumeConsignment('t1', 'cs1', 50, '2026-07-04');
    expect(inventoryService.receiveStock).toHaveBeenCalledWith(
      't1', 'i1', 'wh1', 50, 5, 'CONSIGNMENT', 'cs1', '2026-07-04', expect.any(String));
    expect(cs.qtyConsumed).toBe(80);
    expect(cs.status).toBe(ConsignmentStatus.FULLY_CONSUMED);
  });

  it('returnConsignment tracks partial and full returns', async () => {
    const cs: any = consignment();
    consignmentRepo.findOne.mockResolvedValue(cs);
    await service.returnConsignment('t1', 'cs1', 10);
    expect(cs.qtyReturned).toBe(30);
    expect(cs.status).toBe(ConsignmentStatus.PARTIALLY_RETURNED);

    await service.returnConsignment('t1', 'cs1', 40); // consumes the remaining 40
    expect(cs.status).toBe(ConsignmentStatus.RETURNED);

    await expect(service.returnConsignment('t1', 'cs1', 1)).rejects.toThrow('available to return');
  });

  // ─── Stock transfer orders ──────────────────────────────────────

  const sto = (over: any = {}) => ({
    id: 'sto1', tenantId: 't1', stoNumber: 'STO-00001', status: StoStatus.APPROVED,
    fromWarehouseId: 'wh-a', toWarehouseId: 'wh-b',
    lines: [{ itemId: 'i1', qty: 5 }], ...over,
  });

  it('the STO lifecycle moves stock out of the source and into the target warehouse', async () => {
    stoRepo.findOne.mockResolvedValue(sto({ status: StoStatus.DRAFT }));
    await expect(service.issueGoodsSto('t1', 'sto1')).rejects.toThrow('must be APPROVED');

    const approved: any = sto();
    stoRepo.findOne.mockResolvedValue(approved);
    await service.issueGoodsSto('t1', 'sto1', '2026-07-04');
    expect(inventoryService.issueStock).toHaveBeenCalledWith(
      't1', 'i1', 'wh-a', 5, 'STO', 'sto1', '2026-07-04', expect.any(String));
    expect(approved.status).toBe(StoStatus.GOODS_ISSUED);

    await service.receiveGoodsSto('t1', 'sto1', '2026-07-05');
    // received at the source warehouse's average cost
    expect(inventoryService.receiveStock).toHaveBeenCalledWith(
      't1', 'i1', 'wh-b', 5, 12.5, 'STO', 'sto1', '2026-07-05', expect.any(String));
    expect(approved.status).toBe(StoStatus.GOODS_RECEIVED);

    await service.completeSto('t1', 'sto1');
    expect(approved.status).toBe(StoStatus.COMPLETED);
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.getSubcontractOrder('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(scRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
