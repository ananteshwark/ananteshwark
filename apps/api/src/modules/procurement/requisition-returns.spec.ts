import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RequisitionService } from './requisition/requisition.service';
import { RequisitionStatus } from './requisition/entities/purchase-requisition.entity';
import { ReturnsService } from './returns/returns.service';
import { PurchaseReturnStatus } from './returns/entities/purchase-return.entity';

/**
 * Purchase requisitions: numbering + totals, the DRAFT → SUBMITTED →
 * APPROVED/REJECTED machine, edit/cancel guards, line replacement on update.
 * Purchase returns: amount math, posting reverses stock and produces the
 * debit note, DRAFT-only posting.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '2' }),
  })),
});

describe('RequisitionService', () => {
  let service: RequisitionService;
  let reqRepo: any, lineRepo: any;

  beforeEach(() => {
    reqRepo = mockRepo(); lineRepo = mockRepo();
    service = new RequisitionService(reqRepo, lineRepo);
  });

  it('createRequisition numbers PR-xxxxxx and totals the lines', async () => {
    reqRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });
    await service.createRequisition('t1', 'u1', {
      title: 'Laptops', priority: 'HIGH',
      lines: [
        { description: 'Laptop', quantity: 2, unitPrice: 999.99 },
        { description: 'Mouse', quantity: 3 }, // no price → 0
      ],
    } as any);
    expect(reqRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      reqNumber: 'PR-000003', status: RequisitionStatus.DRAFT, totalAmount: 1999.98,
      requestedByUserId: 'u1',
    }));
    expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({ lineNumber: 1, estimatedTotal: 1999.98 }));
  });

  it('update replaces lines and recomputes the total, DRAFT only', async () => {
    reqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RequisitionStatus.SUBMITTED });
    await expect(service.updateRequisition('t1', 'r1', { title: 'X' } as any)).rejects.toThrow(BadRequestException);

    const draft: any = { id: 'r1', tenantId: 't1', status: RequisitionStatus.DRAFT };
    reqRepo.findOne.mockResolvedValue(draft);
    await service.updateRequisition('t1', 'r1', { lines: [{ description: 'A', quantity: 1, unitPrice: 50 }] } as any);
    expect(lineRepo.delete).toHaveBeenCalledWith({ requisitionId: 'r1', tenantId: 't1' });
    expect(draft.totalAmount).toBe(50);
  });

  it('submit → approve/reject enforce the state machine and stamp approver', async () => {
    reqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RequisitionStatus.APPROVED });
    await expect(service.submitRequisition('t1', 'r1')).rejects.toThrow(BadRequestException);
    await expect(service.approveRequisition('t1', 'r1', 'boss')).rejects.toThrow(BadRequestException);

    const submitted: any = { id: 'r1', tenantId: 't1', status: RequisitionStatus.SUBMITTED };
    reqRepo.findOne.mockResolvedValue(submitted);
    await service.rejectRequisition('t1', 'r1', 'over budget', 'boss');
    expect(submitted.status).toBe(RequisitionStatus.REJECTED);
    expect(submitted.rejectionReason).toBe('over budget');
    expect(submitted.approvedById).toBe('boss');
  });

  it('cancel is blocked once CONVERTED', async () => {
    reqRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: RequisitionStatus.CONVERTED });
    await expect(service.cancelRequisition('t1', 'r1')).rejects.toThrow(BadRequestException);
  });
});

describe('ReturnsService', () => {
  let service: ReturnsService;
  let returnRepo: any, lineRepo: any, inventoryService: any;

  beforeEach(() => {
    returnRepo = mockRepo(); lineRepo = mockRepo();
    inventoryService = {
      findItemByCode: jest.fn().mockResolvedValue({ id: 'item-1' }),
      findBestBalanceForItem: jest.fn().mockResolvedValue({ warehouseId: 'wh-1' }),
      issueStock: jest.fn().mockResolvedValue({}),
    };
    service = new ReturnsService(returnRepo, lineRepo, inventoryService);
  });

  it('create computes line amounts and the return total', async () => {
    returnRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1' });
    await service.create('t1', {
      vendorId: 'v1', returnDate: '2026-07-01',
      lines: [{ quantity: 3, unitCost: 10.555, itemCode: 'ITM-1' }],
    } as any);
    expect(returnRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      returnNumber: 'PRTN-000003', status: PurchaseReturnStatus.DRAFT, totalAmount: 31.67,
    }));
  });

  it('postReturn issues stock per line and returns the debit-note amount', async () => {
    const ret: any = { id: 'rt1', tenantId: 't1', status: PurchaseReturnStatus.DRAFT, totalAmount: 100, returnDate: '2026-07-01', returnNumber: 'PRTN-000001' };
    returnRepo.findOne.mockResolvedValue(ret);
    lineRepo.find.mockResolvedValue([{ id: 'l1', quantity: 2, itemId: 'item-1' }]);
    const r = await service.postReturn('t1', 'rt1');
    expect(inventoryService.issueStock).toHaveBeenCalledWith(
      't1', 'item-1', 'wh-1', 2, 'PURCHASE_RETURN', 'rt1', '2026-07-01', expect.any(String));
    expect(ret.status).toBe(PurchaseReturnStatus.POSTED);
    expect(r.debitNoteAmount).toBe(100);
  });

  it('postReturn skips non-stock lines and survives a failed stock reversal', async () => {
    const ret: any = { id: 'rt1', tenantId: 't1', status: PurchaseReturnStatus.DRAFT, totalAmount: 50, returnDate: '2026-07-01' };
    returnRepo.findOne.mockResolvedValue(ret);
    inventoryService.findItemByCode.mockResolvedValue(null); // unresolvable item
    lineRepo.find.mockResolvedValue([{ id: 'l1', quantity: 1, itemId: null, itemCode: 'SVC' }]);
    const r = await service.postReturn('t1', 'rt1');
    expect(inventoryService.issueStock).not.toHaveBeenCalled();
    expect(ret.status).toBe(PurchaseReturnStatus.POSTED);
    expect(r).toBeDefined();
  });

  it('postReturn only posts DRAFT returns', async () => {
    returnRepo.findOne.mockResolvedValue({ id: 'rt1', tenantId: 't1', status: PurchaseReturnStatus.POSTED });
    await expect(service.postReturn('t1', 'rt1')).rejects.toThrow(BadRequestException);
    returnRepo.findOne.mockResolvedValue(null);
    await expect(service.postReturn('t1', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
