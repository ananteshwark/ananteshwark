import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ControllingService } from './controlling.service';
import { mockRepo, mockDataSource } from '../../../test/mock-repo';

function makeService(overrides: Partial<Record<string, any>> = {}): ControllingService {
  const glService = {
    postJournalEntry: jest.fn(async () => ({ id: 'je-1' })),
  } as any;

  return new ControllingService(
    overrides.profitCenterRepo ?? mockRepo(),
    overrides.cycleRepo ?? mockRepo(),
    overrides.entryRepo ?? mockRepo(),
    overrides.costCenterRepo ?? mockRepo(),
    overrides.internalOrderRepo ?? mockRepo(),
    overrides.activityTypeRepo ?? mockRepo(),
    overrides.activityPriceRepo ?? mockRepo(),
    overrides.overheadSheetRepo ?? mockRepo(),
    overrides.glService ?? glService,
    overrides.dataSource ?? mockDataSource(),
  );
}

// ─── Activity Types ────────────────────────────────────────────────────────────

describe('ControllingService — Activity Types (Phase 79)', () => {
  it('listActivityTypes returns all for tenant', async () => {
    const types = [{ id: 'at-1', tenantId: 't1', code: 'MACH' }];
    const repo = mockRepo();
    repo.find.mockResolvedValue(types);
    const svc = makeService({ activityTypeRepo: repo });
    expect(await svc.listActivityTypes('t1')).toEqual(types);
    expect(repo.find).toHaveBeenCalledWith({ where: { tenantId: 't1' }, order: { code: 'ASC' } });
  });

  it('createActivityType persists with tenantId', async () => {
    const repo = mockRepo();
    repo.create.mockImplementation((x: any) => x);
    repo.save.mockImplementation(async (x: any) => ({ ...x, id: 'at-new' }));
    const svc = makeService({ activityTypeRepo: repo });
    const result = await svc.createActivityType('t1', { code: 'LABOR', name: 'Labor Hours', unit: 'HOURS' });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', code: 'LABOR' }));
    expect(result).toMatchObject({ code: 'LABOR', tenantId: 't1' });
  });

  it('updateActivityType throws NotFoundException for unknown id', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue(null);
    const svc = makeService({ activityTypeRepo: repo });
    await expect(svc.updateActivityType('t1', 'bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('updateActivityType updates fields on found entity', async () => {
    const existing = { id: 'at-1', tenantId: 't1', code: 'MACH', name: 'Old', isActive: true };
    const repo = mockRepo();
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ activityTypeRepo: repo });
    const result = await svc.updateActivityType('t1', 'at-1', { name: 'Machine Hours' });
    expect(result.name).toBe('Machine Hours');
  });

  it('findActivityTypeById returns null when not found', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue(null);
    const svc = makeService({ activityTypeRepo: repo });
    expect(await svc.findActivityTypeById('t1', 'x')).toBeNull();
  });
});

// ─── Activity Prices ───────────────────────────────────────────────────────────

describe('ControllingService — Activity Prices (Phase 79)', () => {
  it('setActivityPrice creates new price and computes plannedRate', async () => {
    const priceRepo = mockRepo();
    priceRepo.findOne.mockResolvedValue(null);
    priceRepo.create.mockImplementation((x: any) => x);
    priceRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'ap-1' }));
    const svc = makeService({ activityPriceRepo: priceRepo });

    const result = await svc.setActivityPrice('t1', {
      activityTypeId: 'at-1',
      costCenterId: 'cc-1',
      fiscalYear: 2026,
      plannedCost: 120000,
      plannedQty: 2400,
    });

    expect(result.plannedRate).toBeCloseTo(50, 4); // 120000 / 2400 = 50
    expect(priceRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1', plannedRate: 50, actualCost: 0, actualQty: 0,
    }));
  });

  it('setActivityPrice updates existing price when found', async () => {
    const existing = { id: 'ap-1', tenantId: 't1', activityTypeId: 'at-1', costCenterId: 'cc-1', fiscalYear: 2026,
      plannedCost: 100000, plannedQty: 2000, plannedRate: 50, actualCost: 0, actualQty: 0, actualRate: 0 };
    const priceRepo = mockRepo();
    priceRepo.findOne.mockResolvedValue(existing);
    priceRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ activityPriceRepo: priceRepo });

    const result = await svc.setActivityPrice('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1', fiscalYear: 2026,
      plannedCost: 144000, plannedQty: 1200,
    });

    expect(result.plannedRate).toBeCloseTo(120, 4); // 144000 / 1200 = 120
    expect(priceRepo.create).not.toHaveBeenCalled();
  });

  it('setActivityPrice sets plannedRate to 0 when plannedQty is 0', async () => {
    const priceRepo = mockRepo();
    priceRepo.findOne.mockResolvedValue(null);
    priceRepo.create.mockImplementation((x: any) => x);
    priceRepo.save.mockImplementation(async (x: any) => x);
    const svc = makeService({ activityPriceRepo: priceRepo });
    const result = await svc.setActivityPrice('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1', fiscalYear: 2026,
      plannedCost: 100, plannedQty: 0,
    });
    expect(result.plannedRate).toBe(0);
  });

  it('listActivityPrices filters by fiscalYear when provided', async () => {
    const priceRepo = mockRepo();
    priceRepo.find.mockResolvedValue([]);
    const svc = makeService({ activityPriceRepo: priceRepo });
    await svc.listActivityPrices('t1', 2026);
    expect(priceRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 't1', fiscalYear: 2026 },
    }));
  });
});

// ─── Activity Confirmation ─────────────────────────────────────────────────────

describe('ControllingService — confirmActivity (Phase 79)', () => {
  const baseType = { id: 'at-1', tenantId: 't1', code: 'MACH', name: 'Machine', wipAccountId: 'acct-wip', creditAccountId: 'acct-cc' };
  const basePrice = { id: 'ap-1', tenantId: 't1', activityTypeId: 'at-1', costCenterId: 'cc-1', fiscalYear: 2026,
    plannedRate: 50, actualRate: 0, actualCost: 0, actualQty: 0 };

  it('uses plannedRate when actualRate is 0 and posts GL entry', async () => {
    const atRepo = mockRepo();
    atRepo.findOne.mockResolvedValue(baseType);
    const apRepo = mockRepo();
    apRepo.findOne.mockResolvedValue({ ...basePrice });
    apRepo.save.mockImplementation(async (x: any) => x);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-1' })) };
    const svc = makeService({ activityTypeRepo: atRepo, activityPriceRepo: apRepo, glService: glSvc });

    const result = await svc.confirmActivity('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1',
      productionOrderId: 'po-1', qty: 10,
      confirmationDate: '2026-03-15',
    });

    expect(result.cost).toBe(500); // 10 * 50
    expect(result.journalEntryId).toBe('je-1');
    expect(glSvc.postJournalEntry).toHaveBeenCalledWith('t1', expect.objectContaining({
      lines: expect.arrayContaining([
        expect.objectContaining({ accountId: 'acct-wip', debit: 500 }),
        expect.objectContaining({ accountId: 'acct-cc', credit: 500 }),
      ]),
    }), null);
  });

  it('uses actualRate over plannedRate when actualRate > 0', async () => {
    const atRepo = mockRepo();
    atRepo.findOne.mockResolvedValue(baseType);
    const priceWithActual = { ...basePrice, actualRate: 75 };
    const apRepo = mockRepo();
    apRepo.findOne.mockResolvedValue(priceWithActual);
    apRepo.save.mockImplementation(async (x: any) => x);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-2' })) };
    const svc = makeService({ activityTypeRepo: atRepo, activityPriceRepo: apRepo, glService: glSvc });

    const result = await svc.confirmActivity('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1',
      productionOrderId: 'po-1', qty: 4,
      confirmationDate: '2026-03-15',
    });

    expect(result.cost).toBe(300); // 4 * 75
  });

  it('updates ActivityPrice actual quantities and recalculates actualRate', async () => {
    const atRepo = mockRepo();
    atRepo.findOne.mockResolvedValue(baseType);
    const price = { ...basePrice, actualCost: 1000, actualQty: 20, actualRate: 50 };
    const apRepo = mockRepo();
    apRepo.findOne.mockResolvedValue(price);
    apRepo.save.mockImplementation(async (x: any) => x);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-3' })) };
    const svc = makeService({ activityTypeRepo: atRepo, activityPriceRepo: apRepo, glService: glSvc });

    await svc.confirmActivity('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1',
      productionOrderId: 'po-1', qty: 10,
      confirmationDate: '2026-03-15',
    });

    // actualCost was 1000, adding 10*50=500 → 1500; actualQty 20+10=30; rate 1500/30=50
    const savedPrice = apRepo.save.mock.calls[0][0];
    expect(savedPrice.actualCost).toBe(1500);
    expect(savedPrice.actualQty).toBe(30);
    expect(savedPrice.actualRate).toBeCloseTo(50, 4);
  });

  it('throws NotFoundException when activity type does not exist', async () => {
    const atRepo = mockRepo();
    atRepo.findOne.mockResolvedValue(null);
    const svc = makeService({ activityTypeRepo: atRepo });
    await expect(svc.confirmActivity('t1', {
      activityTypeId: 'bad', costCenterId: 'cc-1',
      productionOrderId: 'po-1', qty: 1, confirmationDate: '2026-03-15',
    })).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when wipAccountId is missing', async () => {
    const atNoAcct = { ...baseType, wipAccountId: null };
    const atRepo = mockRepo();
    atRepo.findOne.mockResolvedValue(atNoAcct);
    const svc = makeService({ activityTypeRepo: atRepo });
    await expect(svc.confirmActivity('t1', {
      activityTypeId: 'at-1', costCenterId: 'cc-1',
      productionOrderId: 'po-1', qty: 1, confirmationDate: '2026-03-15',
    })).rejects.toThrow(BadRequestException);
  });
});

// ─── Overhead Costing Sheets ──────────────────────────────────────────────────

describe('ControllingService — Overhead Sheets (Phase 79)', () => {
  const baseSheet = {
    id: 'sh-1', tenantId: 't1', code: 'OH1', name: 'Factory OH', isActive: true,
    lines: [
      { sequence: 1, name: 'Factory', base: 'MATERIAL_COST', rate: 10, debitAccountId: 'db-1', creditAccountId: 'cr-1' },
      { sequence: 2, name: 'Labor OH', base: 'LABOR_COST', rate: 20, debitAccountId: 'db-2', creditAccountId: 'cr-2' },
    ],
  };

  it('listOverheadCostingSheets returns all for tenant', async () => {
    const repo = mockRepo();
    repo.find.mockResolvedValue([baseSheet]);
    const svc = makeService({ overheadSheetRepo: repo });
    const result = await svc.listOverheadCostingSheets('t1');
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('OH1');
  });

  it('createOverheadCostingSheet saves with tenantId', async () => {
    const repo = mockRepo();
    repo.create.mockImplementation((x: any) => x);
    repo.save.mockImplementation(async (x: any) => ({ ...x, id: 'sh-new' }));
    const svc = makeService({ overheadSheetRepo: repo });
    const result = await svc.createOverheadCostingSheet('t1', { code: 'OH2', name: 'Test', lines: [] });
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', code: 'OH2' }));
    expect(result).toMatchObject({ code: 'OH2' });
  });

  it('updateOverheadCostingSheet throws NotFoundException for unknown id', async () => {
    const repo = mockRepo();
    repo.findOne.mockResolvedValue(null);
    const svc = makeService({ overheadSheetRepo: repo });
    await expect(svc.updateOverheadCostingSheet('t1', 'x', {})).rejects.toThrow(NotFoundException);
  });

  it('applyOverheadToOrder computes material-based and labor-based overhead separately', async () => {
    const sheetRepo = mockRepo();
    sheetRepo.findOne.mockResolvedValue(baseSheet);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-oh' })) };
    const svc = makeService({ overheadSheetRepo: sheetRepo, glService: glSvc });

    const result = await svc.applyOverheadToOrder('t1', 'sh-1', {
      materialCost: 10000, laborCost: 5000, productionOrderId: 'po-1',
    });

    // material: 10000 * 10% = 1000; labor: 5000 * 20% = 1000
    expect(result.totalOverhead).toBe(2000);
    expect(result.lineResults).toHaveLength(2);
    expect(result.lineResults[0].overhead).toBe(1000);
    expect(result.lineResults[1].overhead).toBe(1000);
    expect(glSvc.postJournalEntry).toHaveBeenCalledTimes(2);
  });

  it('applyOverheadToOrder uses TOTAL_COST base correctly', async () => {
    const sheetWithTotal = {
      ...baseSheet,
      lines: [{ sequence: 1, name: 'Total OH', base: 'TOTAL_COST', rate: 5, debitAccountId: 'db-1', creditAccountId: 'cr-1' }],
    };
    const sheetRepo = mockRepo();
    sheetRepo.findOne.mockResolvedValue(sheetWithTotal);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-total' })) };
    const svc = makeService({ overheadSheetRepo: sheetRepo, glService: glSvc });

    const result = await svc.applyOverheadToOrder('t1', 'sh-1', {
      materialCost: 10000, laborCost: 5000, productionOrderId: 'po-1',
    });

    // (10000 + 5000) * 5% = 750
    expect(result.totalOverhead).toBe(750);
  });

  it('applyOverheadToOrder throws BadRequestException for inactive sheet', async () => {
    const inactiveSheet = { ...baseSheet, isActive: false };
    const sheetRepo = mockRepo();
    sheetRepo.findOne.mockResolvedValue(inactiveSheet);
    const svc = makeService({ overheadSheetRepo: sheetRepo });
    await expect(svc.applyOverheadToOrder('t1', 'sh-1', {
      materialCost: 1000, laborCost: 500, productionOrderId: 'po-1',
    })).rejects.toThrow(BadRequestException);
  });

  it('applyOverheadToOrder skips lines with zero overhead', async () => {
    const sheetWithZero = {
      ...baseSheet,
      lines: [
        { sequence: 1, name: 'Zero', base: 'MATERIAL_COST', rate: 0, debitAccountId: 'db-1', creditAccountId: 'cr-1' },
        { sequence: 2, name: 'Real', base: 'LABOR_COST', rate: 15, debitAccountId: 'db-2', creditAccountId: 'cr-2' },
      ],
    };
    const sheetRepo = mockRepo();
    sheetRepo.findOne.mockResolvedValue(sheetWithZero);
    const glSvc = { postJournalEntry: jest.fn(async () => ({ id: 'je-x' })) };
    const svc = makeService({ overheadSheetRepo: sheetRepo, glService: glSvc });

    const result = await svc.applyOverheadToOrder('t1', 'sh-1', {
      materialCost: 0, laborCost: 4000, productionOrderId: 'po-1',
    });

    expect(glSvc.postJournalEntry).toHaveBeenCalledTimes(1);
    expect(result.lineResults).toHaveLength(1);
    expect(result.totalOverhead).toBe(600); // 4000 * 15%
  });
});
