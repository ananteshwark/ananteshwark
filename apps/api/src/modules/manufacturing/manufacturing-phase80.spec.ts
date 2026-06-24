import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ManufacturingService } from './manufacturing.service';
import { mockRepo, mockDataSource } from '../../test/mock-repo';
import { ProductionOrderStatus } from './entities/production-order.entity';
import { CostingRunStatus } from './entities/costing-run.entity';

function makeService(overrides: Partial<Record<string, any>> = {}): ManufacturingService {
  const glService = {
    postJournalEntry: jest.fn(async () => ({ id: 'je-1' })),
    findAccounts: jest.fn(async () => ({ items: [] })),
  } as any;

  const inventoryService = {
    findItemByCode: jest.fn(async () => null),
    updateItem: jest.fn(async (_, __, d: any) => d),
  } as any;

  const controllingService = {
    findActivityTypeById: jest.fn(async () => null),
    confirmActivity: jest.fn(async () => ({ journalEntryId: 'je-act', cost: 0 })),
  } as any;

  return new ManufacturingService(
    overrides.bomRepo ?? mockRepo(),
    overrides.bomLineRepo ?? mockRepo(),
    overrides.wcRepo ?? mockRepo(),
    overrides.orderRepo ?? mockRepo(),
    overrides.issuanceRepo ?? mockRepo(),
    overrides.routingRepo ?? mockRepo(),
    overrides.routingOpRepo ?? mockRepo(),
    overrides.confirmationRepo ?? mockRepo(),
    overrides.costingRunRepo ?? mockRepo(),
    overrides.glService ?? glService,
    overrides.inventoryService ?? inventoryService,
    overrides.controllingService ?? controllingService,
    overrides.dataSource ?? mockDataSource(),
  );
}

// ─── completeOrder (Phase 80: transactional GL) ───────────────────────────────

describe('ManufacturingService.completeOrder — transactional GL (Phase 80)', () => {
  const baseOrder = {
    id: 'po-1', tenantId: 't1', orderNumber: 'MFG-00001',
    finishedItemName: 'Widget', status: ProductionOrderStatus.RELEASED,
    wipBalance: 5000, actualMaterialCost: 3000, actualLaborCost: 2000,
    journalEntryId: null,
  };

  it('throws NotFoundException for unknown order', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue(null);
    const svc = makeService({ orderRepo });
    await expect(svc.completeOrder('t1', 'bad-id', { producedQuantity: 1, actualEndDate: '2026-03-01' } as any, 'user-1'))
      .rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for CANCELLED order', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder, status: ProductionOrderStatus.CANCELLED });
    const svc = makeService({ orderRepo });
    await expect(svc.completeOrder('t1', 'po-1', { producedQuantity: 1, actualEndDate: '2026-03-01' } as any, 'user-1'))
      .rejects.toThrow(BadRequestException);
  });

  it('posts GL inside transaction when WIP balance > 0 and accounts found', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder });
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-comp' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })
        .mockResolvedValueOnce({ items: [{ id: 'fg-acct' }] }),
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    const result = await svc.completeOrder('t1', 'po-1', { producedQuantity: 100, actualEndDate: '2026-03-01' } as any, 'user-1');

    expect(ds.transaction).toHaveBeenCalled();
    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ lines: expect.arrayContaining([
        expect.objectContaining({ debit: 5000 }), // wipBalance as transfer amount
        expect.objectContaining({ credit: 5000 }),
      ])}),
      'user-1',
      manager,
    );
    expect(result.journalEntryId).toBe('je-comp');
  });

  it('skips GL posting when no WIP balance and no actual costs', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder, wipBalance: 0, actualMaterialCost: 0, actualLaborCost: 0 });
    const glService = { postJournalEntry: jest.fn(), findAccounts: jest.fn() };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await svc.completeOrder('t1', 'po-1', { producedQuantity: 50, actualEndDate: '2026-03-01' } as any, 'user-1');

    expect(glService.postJournalEntry).not.toHaveBeenCalled();
  });

  it('does not post GL when GL accounts are not found (no FG account)', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder });
    const glService = {
      postJournalEntry: jest.fn(),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })
        .mockResolvedValueOnce({ items: [] }), // no FG account
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await svc.completeOrder('t1', 'po-1', { producedQuantity: 50, actualEndDate: '2026-03-01' } as any, 'user-1');

    expect(glService.postJournalEntry).not.toHaveBeenCalled();
  });

  it('marks order COMPLETED and uses actualMaterialCost + actualLaborCost when wipBalance is null', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder, wipBalance: null, actualMaterialCost: 2500, actualLaborCost: 1500 });
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-fallback' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })
        .mockResolvedValueOnce({ items: [{ id: 'fg-acct' }] }),
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await svc.completeOrder('t1', 'po-1', { producedQuantity: 50, actualEndDate: '2026-03-01' } as any, 'user-1');

    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ lines: expect.arrayContaining([
        expect.objectContaining({ debit: 4000 }), // 2500 + 1500
      ])}),
      'user-1',
      manager,
    );
  });
});

// ─── settleOrder (Phase 80: transactional variance GL) ───────────────────────

describe('ManufacturingService.settleOrder — transactional variance GL (Phase 80)', () => {
  const baseOrder = {
    id: 'po-1', tenantId: 't1', orderNumber: 'MFG-00001',
    status: ProductionOrderStatus.COMPLETED, costStatus: 'OPEN',
    plannedMaterialCost: 3000, plannedLaborCost: 1000,
    actualMaterialCost: 3500, actualLaborCost: 1200,
    plannedOverheadCost: null, actualOverheadCost: null,
    wipBalance: 4700,
  };

  it('throws NotFoundException for unknown order', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue(null);
    const svc = makeService({ orderRepo });
    await expect(svc.settleOrder('t1', 'bad')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException for already SETTLED order', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder, costStatus: 'SETTLED' });
    const svc = makeService({ orderRepo });
    await expect(svc.settleOrder('t1', 'po-1')).rejects.toThrow(BadRequestException);
  });

  it('posts unfavorable variance GL when actual > planned', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...baseOrder });
    // actual (3500+1200=4700) - planned (3000+1000=4000) = 700 unfavorable
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-var' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })  // WIP
        .mockResolvedValueOnce({ items: [{ id: 'var-acct' }] }), // variance
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    const result = await svc.settleOrder('t1', 'po-1');

    expect(ds.transaction).toHaveBeenCalled();
    // Unfavorable: DR Variance, CR WIP
    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'var-acct', debit: 700 }),
          expect.objectContaining({ accountId: 'wip-acct', credit: 700 }),
        ]),
      }),
      null,
      manager,
    );
    expect(result.costStatus).toBe('SETTLED');
    expect(result.wipBalance).toBe(0);
    expect(result.materialVariance).toBe(500);
    expect(result.laborVariance).toBe(200);
  });

  it('posts favorable variance GL when actual < planned — swaps DR/CR sides', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({
      ...baseOrder,
      actualMaterialCost: 2800, actualLaborCost: 900,
    });
    // actual (2800+900=3700) - planned (3000+1000=4000) = -300 favorable
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-fav' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })
        .mockResolvedValueOnce({ items: [{ id: 'var-acct' }] }),
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await svc.settleOrder('t1', 'po-1');

    // Favorable: DR WIP, CR Variance
    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'wip-acct', debit: 300 }),
          expect.objectContaining({ accountId: 'var-acct', credit: 300 }),
        ]),
      }),
      null,
      manager,
    );
  });

  it('skips GL when actual equals planned (zero variance)', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({
      ...baseOrder,
      actualMaterialCost: 3000, actualLaborCost: 1000,
    });
    const glService = { postJournalEntry: jest.fn(), findAccounts: jest.fn() };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await svc.settleOrder('t1', 'po-1');

    expect(glService.postJournalEntry).not.toHaveBeenCalled();
  });
});

// ─── retryGlForOrder (Phase 80) ───────────────────────────────────────────────

describe('ManufacturingService.retryGlForOrder (Phase 80)', () => {
  const completedOrder = {
    id: 'po-1', tenantId: 't1', orderNumber: 'MFG-00001',
    finishedItemName: 'Gadget', status: ProductionOrderStatus.COMPLETED,
    wipBalance: 4000, actualMaterialCost: 2500, actualLaborCost: 1500,
    journalEntryId: null, actualEndDate: '2026-03-01',
  };

  it('is idempotent — returns early when journalEntryId is already set', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...completedOrder, journalEntryId: 'je-existing' });
    const glService = { postJournalEntry: jest.fn(), findAccounts: jest.fn() };
    const svc = makeService({ orderRepo, glService });

    const result = await svc.retryGlForOrder('t1', 'po-1', 'user-1');

    expect(result.journalEntryId).toBe('je-existing');
    expect(glService.postJournalEntry).not.toHaveBeenCalled();
  });

  it('throws BadRequestException for non-COMPLETED order', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...completedOrder, status: ProductionOrderStatus.PLANNED });
    const svc = makeService({ orderRepo });
    await expect(svc.retryGlForOrder('t1', 'po-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when no WIP balance to transfer', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...completedOrder, wipBalance: 0, actualMaterialCost: 0, actualLaborCost: 0 });
    const svc = makeService({ orderRepo });
    await expect(svc.retryGlForOrder('t1', 'po-1', 'user-1')).rejects.toThrow(BadRequestException);
  });

  it('posts GL and updates journalEntryId on success', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...completedOrder });
    const glService = {
      postJournalEntry: jest.fn(async () => ({ id: 'je-retry' })),
      findAccounts: jest.fn()
        .mockResolvedValueOnce({ items: [{ id: 'wip-acct' }] })
        .mockResolvedValueOnce({ items: [{ id: 'fg-acct' }] }),
    };
    const manager = { save: jest.fn(async (x: any) => x) };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    const result = await svc.retryGlForOrder('t1', 'po-1', 'user-1');

    expect(glService.postJournalEntry).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ reference: 'PO-RETRY-MFG-00001' }),
      'user-1',
      manager,
    );
    expect(result.journalEntryId).toBe('je-retry');
  });

  it('throws BadRequestException when GL accounts are not configured', async () => {
    const orderRepo = mockRepo();
    orderRepo.findOne.mockResolvedValue({ ...completedOrder });
    const glService = {
      postJournalEntry: jest.fn(),
      findAccounts: jest.fn().mockResolvedValue({ items: [] }),
    };
    const manager = { save: jest.fn() };
    const ds = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    const svc = makeService({ orderRepo, glService, dataSource: ds });

    await expect(svc.retryGlForOrder('t1', 'po-1', 'user-1')).rejects.toThrow(BadRequestException);
  });
});

// ─── getGlReconciliation (Phase 80) ──────────────────────────────────────────

describe('ManufacturingService.getGlReconciliation (Phase 80)', () => {
  it('returns empty list when all orders have GL entries', async () => {
    const orderRepo = mockRepo();
    orderRepo.find.mockResolvedValue([]);
    const svc = makeService({ orderRepo });
    const result = await svc.getGlReconciliation('t1');
    expect(result).toEqual([]);
  });

  it('returns orders missing journalEntryId', async () => {
    const missing = [
      { id: 'po-1', orderNumber: 'MFG-00001', status: ProductionOrderStatus.COMPLETED,
        costStatus: 'OPEN', journalEntryId: null, actualMaterialCost: 1000, actualLaborCost: 500 },
      { id: 'po-2', orderNumber: 'MFG-00002', status: ProductionOrderStatus.COMPLETED,
        costStatus: 'SETTLED', journalEntryId: null, actualMaterialCost: 2000, actualLaborCost: 800 },
    ];
    const orderRepo = mockRepo();
    orderRepo.find.mockResolvedValue(missing);
    const svc = makeService({ orderRepo });

    const result = await svc.getGlReconciliation('t1');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'PRODUCTION_ORDER', documentNumber: 'MFG-00001', amount: 1500 });
    expect(result[1]).toMatchObject({ type: 'PRODUCTION_ORDER', documentNumber: 'MFG-00002', amount: 2800 });
  });
});
