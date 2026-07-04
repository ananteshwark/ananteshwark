import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GrnService } from './grn.service';
import { GrnStatus } from './entities/grn.entity';
import { PoStatus } from '../po/entities/purchase-order.entity';

/**
 * Goods receipt: PO-status gate, the over-receipt guard (receipt capped at
 * remaining PO quantity), line snapshotting, the read-only 3-way match
 * report, and cancel/confirm status guards.
 */
describe('GrnService', () => {
  let service: GrnService;
  let grnRepo: any, lineRepo: any, billRepo: any, billLineRepo: any, vendorRepo: any,
    accountRepo: any, poService: any, glService: any, dataSource: any, grirService: any, inventoryService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '7' }),
    })),
  });

  const po = (over: any = {}) => ({
    id: 'po1', vendorId: 'v1', poNumber: 'PO-1', status: PoStatus.APPROVED, currency: 'INR',
    lines: [
      { id: 'pol1', lineNumber: 1, quantity: 10, quantityReceived: 6, unitPrice: 5, description: 'Widget' },
    ],
    ...over,
  });

  beforeEach(() => {
    grnRepo = mockRepo(); lineRepo = mockRepo(); billRepo = mockRepo();
    billLineRepo = mockRepo(); vendorRepo = mockRepo(); accountRepo = mockRepo();
    poService = {
      findOne: jest.fn().mockResolvedValue(po()),
      updateLineQuantityReceived: jest.fn(),
      updatePoStatus: jest.fn(),
    };
    glService = { postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }) };
    dataSource = { transaction: jest.fn(async (cb: any) => cb({ findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn() })) };
    grirService = { createGrEntry: jest.fn().mockResolvedValue({}) };
    inventoryService = { findItemByCode: jest.fn().mockResolvedValue(null), findBestBalanceForItem: jest.fn(), receiveStock: jest.fn() };
    service = new GrnService(
      grnRepo, lineRepo, billRepo, billLineRepo, vendorRepo, accountRepo,
      poService, glService, dataSource, grirService, inventoryService,
    );
  });

  it('rejects a GRN against a DRAFT PO', async () => {
    poService.findOne.mockResolvedValue(po({ status: PoStatus.DRAFT }));
    await expect(
      service.createGrn('t1', { poId: 'po1', receiptDate: '2026-07-01', lines: [] } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects over-receipt beyond the remaining PO quantity', async () => {
    // remaining = 10 ordered - 6 received = 4
    await expect(
      service.createGrn('t1', {
        poId: 'po1', receiptDate: '2026-07-01',
        lines: [{ poLineId: 'pol1', quantityReceived: 5, quantityAccepted: 5 }],
      } as any),
    ).rejects.toThrow(/exceeds remaining quantity 4/);
  });

  it('accepts a receipt up to exactly the remaining quantity and snapshots the line', async () => {
    grnRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });
    await service.createGrn('t1', {
      poId: 'po1', receiptDate: '2026-07-01',
      lines: [{ poLineId: 'pol1', quantityReceived: 4, quantityAccepted: 3, quantityRejected: 1, rejectionReason: 'damaged' }],
    } as any);
    expect(grnRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      grnNumber: 'GRN-000008', status: GrnStatus.DRAFT, vendorId: 'v1',
    }));
    expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      quantityOrdered: 10, quantityReceived: 4, quantityAccepted: 3, quantityRejected: 1,
    }));
  });

  it('rejects an unknown PO line reference', async () => {
    await expect(
      service.createGrn('t1', {
        poId: 'po1', receiptDate: '2026-07-01',
        lines: [{ poLineId: 'ghost', quantityReceived: 1, quantityAccepted: 1 }],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('threeWayMatch reports per-line qty match against the PO', async () => {
    grnRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', poId: 'po1' });
    lineRepo.find.mockResolvedValue([{ poLineId: 'pol1', quantityAccepted: 10 }]);
    poService.findOne.mockResolvedValue(po({ lines: [{ id: 'pol1', quantity: 10, unitPrice: 5, description: 'Widget' }] }));
    const r = await service.threeWayMatch('t1', 'g1');
    expect(r.matched).toBe(true);

    lineRepo.find.mockResolvedValue([{ poLineId: 'pol1', quantityAccepted: 8 }]);
    const partial = await service.threeWayMatch('t1', 'g1');
    expect(partial.matched).toBe(false);
    expect(partial.lines[0]).toMatchObject({ poQty: 10, grnQty: 8, matched: false });
  });

  it('cancelGrn only cancels DRAFT receipts', async () => {
    grnRepo.findOne.mockResolvedValue({ id: 'g1', tenantId: 't1', status: GrnStatus.CONFIRMED });
    await expect(service.cancelGrn('t1', 'g1')).rejects.toThrow(BadRequestException);

    const draft: any = { id: 'g1', tenantId: 't1', status: GrnStatus.DRAFT };
    grnRepo.findOne.mockResolvedValue(draft);
    lineRepo.find.mockResolvedValue([]);
    await service.cancelGrn('t1', 'g1');
    expect(draft.status).toBe(GrnStatus.CANCELLED);
  });

  it('confirmGrn refuses non-DRAFT receipts inside the transaction', async () => {
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        findOne: jest.fn().mockResolvedValue({ id: 'g1', tenantId: 't1', status: GrnStatus.CONFIRMED }),
        find: jest.fn().mockResolvedValue([]),
        save: jest.fn(),
      }));
    await expect(service.confirmGrn('t1', 'g1', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('lookups are tenant-scoped 404s', async () => {
    grnRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(grnRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
