import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryV2Service } from './inventory-v2.service';
import { LotStatus } from './entities/lot-serial.entity';
import { CycleCountStatus, CycleCountLineStatus } from './entities/cycle-count.entity';
import { RmaStatus } from './entities/rma.entity';

/**
 * Inventory v2: lot receipt/quarantine, cycle counts snapshotting system
 * quantities and flagging variances, posting guards, and the RMA
 * DRAFT → APPROVED → RECEIVED lifecycle with total-value math.
 */
describe('InventoryV2Service', () => {
  let service: InventoryV2Service;
  let binRepo: any, lotRepo: any, uomRepo: any, countRepo: any, countLineRepo: any, rmaRepo: any, balanceRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ mx: 0 }),
    })),
  });

  beforeEach(() => {
    binRepo = mockRepo(); lotRepo = mockRepo(); uomRepo = mockRepo(); countRepo = mockRepo();
    countLineRepo = mockRepo(); rmaRepo = mockRepo(); balanceRepo = mockRepo();
    service = new InventoryV2Service(binRepo, lotRepo, uomRepo, countRepo, countLineRepo, rmaRepo, balanceRepo);
  });

  it('receiveLot seeds availableQty from receivedQty; quarantine flips the status', async () => {
    const lot = await service.receiveLot('t1', { itemId: 'i1', receivedQty: 100 } as any);
    expect(lot.availableQty).toBe(100);

    lotRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', status: LotStatus.ACTIVE });
    const q = await service.quarantineLot('t1', 'l1');
    expect(q.status).toBe(LotStatus.QUARANTINE);
  });

  it('createCycleCount snapshots system quantities for the warehouse (optionally filtered by items)', async () => {
    balanceRepo.find.mockResolvedValue([
      { itemId: 'i1', qtyOnHand: 10 },
      { itemId: 'i2', qtyOnHand: 5 },
    ]);
    const count = await service.createCycleCount('t1', { warehouseId: 'wh1', countDate: '2026-07-04', itemIds: ['i1'] });
    expect(count.countNumber).toBe('CC-000001');
    expect(count.status).toBe(CycleCountStatus.COUNTING);
    expect(countLineRepo.create).toHaveBeenCalledTimes(1); // i2 filtered out
    expect(countLineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'i1', systemQty: 10 }));
  });

  it('enterCountedQty computes variance and flags the line accordingly', async () => {
    countLineRepo.findOne.mockResolvedValue({ id: 'ln1', tenantId: 't1', systemQty: 10 });
    const varianceLine = await service.enterCountedQty('t1', 'ln1', 8);
    expect(varianceLine.varianceQty).toBe(-2);
    expect(varianceLine.status).toBe(CycleCountLineStatus.VARIANCE);

    countLineRepo.findOne.mockResolvedValue({ id: 'ln2', tenantId: 't1', systemQty: 10 });
    const cleanLine = await service.enterCountedQty('t1', 'ln2', 10);
    expect(cleanLine.status).toBe(CycleCountLineStatus.ACCEPTED);
  });

  it('postCycleCount requires COUNTING or REVIEWED', async () => {
    countRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CycleCountStatus.POSTED });
    await expect(service.postCycleCount('t1', 'c1')).rejects.toThrow(BadRequestException);

    countRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CycleCountStatus.COUNTING });
    const posted = await service.postCycleCount('t1', 'c1');
    expect(posted.status).toBe(CycleCountStatus.POSTED);
  });

  it('createRma totals line values; approve/receive enforce the lifecycle', async () => {
    const rma = await service.createRma('t1', {
      lines: [{ qty: 2, unitCost: 25.5 }, { qty: 1, unitCost: 10 }],
    } as any);
    expect(rma.totalValue).toBe(61);
    expect(rma.rmaNumber).toBe('RMA-000001');

    rmaRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RmaStatus.RECEIVED });
    await expect(service.approveRma('t1', 'r1')).rejects.toThrow(BadRequestException);

    rmaRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RmaStatus.DRAFT });
    await expect(service.receiveRma('t1', 'r1', '2026-07-04')).rejects.toThrow(BadRequestException);

    const approved: any = { id: 'r1', tenantId: 't1', status: RmaStatus.APPROVED };
    rmaRepo.findOne.mockResolvedValue(approved);
    await service.receiveRma('t1', 'r1', '2026-07-04');
    expect(approved.status).toBe(RmaStatus.RECEIVED);
    expect(approved.receivedDate).toBe('2026-07-04');
  });

  it('convertQty rounds to 4 decimals; lookups 404 tenant-scoped', async () => {
    expect(service.convertQty(3, 0.33333)).toBe(1);
    expect(service.convertQty(10, 2.5)).toBe(25);

    await expect(service.quarantineLot('t2', 'ghost')).rejects.toThrow(NotFoundException);
    expect(lotRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't2', id: 'ghost' } });
  });
});
