import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EncumbranceService } from './encumbrance.service';
import { Encumbrance, EncumbranceType, EncumbranceStatus } from './entities/encumbrance.entity';
import { BudgetLine } from '../budget/entities/budget-line.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: 'enc-new', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'enc-new', ...x })),
  createQueryBuilder: jest.fn(),
});

function budgetQb(amount: number) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(amount != null ? [{ amount }] : []),
  };
}

describe('EncumbranceService — Phase 125-127', () => {
  let service: EncumbranceService;
  let encRepo: any;
  let budgetRepo: any;

  beforeEach(async () => {
    encRepo = mockRepo();
    budgetRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        EncumbranceService,
        { provide: getRepositoryToken(Encumbrance), useValue: encRepo },
        { provide: getRepositoryToken(BudgetLine), useValue: budgetRepo },
      ],
    }).compile();
    service = module.get(EncumbranceService);
  });

  // ─── Ph-126: funds check ──────────────────────────────────────────

  it('fundsCheck — OK when within budget', async () => {
    budgetRepo.createQueryBuilder.mockReturnValue(budgetQb(100000));
    encRepo.find.mockResolvedValue([]); // no existing encumbrances
    const r = await service.fundsCheck('t1', { glAccountId: 'a1', fiscalYear: 2026, amount: 5000 });
    expect(r.status).toBe('OK');
    expect(r.budget).toBe(100000);
    expect(r.available).toBe(100000);
  });

  it('fundsCheck — EXCEEDED when projected over budget', async () => {
    budgetRepo.createQueryBuilder.mockReturnValue(budgetQb(10000));
    encRepo.find.mockResolvedValue([
      { type: EncumbranceType.COMMITMENT, status: EncumbranceStatus.OUTSTANDING, amount: 8000, liquidatedAmount: 0 },
    ]);
    const r = await service.fundsCheck('t1', { glAccountId: 'a1', fiscalYear: 2026, amount: 5000 });
    expect(r.committed).toBe(8000);
    expect(r.available).toBe(2000);
    expect(r.status).toBe('EXCEEDED');
  });

  it('fundsCheck — WARNING above 90%', async () => {
    budgetRepo.createQueryBuilder.mockReturnValue(budgetQb(10000));
    encRepo.find.mockResolvedValue([
      { type: EncumbranceType.EXPENDITURE, status: EncumbranceStatus.LIQUIDATED, amount: 8500, liquidatedAmount: 8500 },
    ]);
    const r = await service.fundsCheck('t1', { glAccountId: 'a1', fiscalYear: 2026, amount: 1000 });
    expect(r.expended).toBe(8500);
    expect(r.status).toBe('WARNING'); // 9500/10000 = 95%
  });

  it('assertFunds — throws when EXCEEDED', async () => {
    budgetRepo.createQueryBuilder.mockReturnValue(budgetQb(1000));
    encRepo.find.mockResolvedValue([]);
    await expect(service.assertFunds('t1', { glAccountId: 'a1', fiscalYear: 2026, amount: 5000 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-125: commitment ───────────────────────────────────────────

  it('createCommitment — happy path', async () => {
    const enc = await service.createCommitment('t1', {
      sourceType: 'PO', sourceId: 'po1', glAccountId: 'a1', fiscalYear: 2026, amount: 5000,
    });
    expect(encRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: EncumbranceType.COMMITMENT, amount: 5000 }));
    expect(enc.id).toBe('enc-new');
  });

  it('createCommitment — enforceFunds blocks over-budget', async () => {
    budgetRepo.createQueryBuilder.mockReturnValue(budgetQb(1000));
    encRepo.find.mockResolvedValue([]);
    await expect(service.createCommitment('t1', {
      sourceType: 'PO', sourceId: 'po1', glAccountId: 'a1', fiscalYear: 2026, amount: 5000, enforceFunds: true,
    })).rejects.toThrow(BadRequestException);
  });

  it('createCommitment — rejects non-positive amount', async () => {
    await expect(service.createCommitment('t1', { sourceType: 'PO', sourceId: 'po1', glAccountId: 'a1', fiscalYear: 2026, amount: 0 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-127: liquidation ──────────────────────────────────────────

  it('liquidate — commitment → obligation, fully liquidates', async () => {
    encRepo.findOne.mockResolvedValue({
      id: 'c1', type: EncumbranceType.COMMITMENT, status: EncumbranceStatus.OUTSTANDING,
      amount: 5000, liquidatedAmount: 0, glAccountId: 'a1', costCenterId: null, fiscalYear: 2026, period: null, sourceType: 'PO', sourceId: 'po1',
    });
    encRepo.save.mockImplementation((x: any) => Promise.resolve(x.id ? x : { id: 'obl1', ...x }));

    const result = await service.liquidate('t1', 'c1', { amount: 5000, nextSourceType: 'GRN', nextSourceId: 'grn1' });
    expect(result.liquidated.status).toBe(EncumbranceStatus.LIQUIDATED);
    expect(result.liquidated.liquidatedAmount).toBe(5000);
    expect(encRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: EncumbranceType.OBLIGATION, amount: 5000, parentId: 'c1' }));
  });

  it('liquidate — partial leaves commitment outstanding', async () => {
    encRepo.findOne.mockResolvedValue({
      id: 'c1', type: EncumbranceType.COMMITMENT, status: EncumbranceStatus.OUTSTANDING,
      amount: 5000, liquidatedAmount: 0, glAccountId: 'a1', costCenterId: null, fiscalYear: 2026, period: null, sourceType: 'PO', sourceId: 'po1',
    });
    encRepo.save.mockImplementation((x: any) => Promise.resolve(x.id ? x : { id: 'obl1', ...x }));
    const result = await service.liquidate('t1', 'c1', { amount: 2000, nextSourceType: 'GRN', nextSourceId: 'grn1' });
    expect(result.liquidated.status).toBe(EncumbranceStatus.OUTSTANDING);
    expect(result.liquidated.liquidatedAmount).toBe(2000);
  });

  it('liquidate — obligation → expenditure', async () => {
    encRepo.findOne.mockResolvedValue({
      id: 'o1', type: EncumbranceType.OBLIGATION, status: EncumbranceStatus.OUTSTANDING,
      amount: 3000, liquidatedAmount: 0, glAccountId: 'a1', costCenterId: null, fiscalYear: 2026, period: null, sourceType: 'GRN', sourceId: 'grn1',
    });
    encRepo.save.mockImplementation((x: any) => Promise.resolve(x.id ? x : { id: 'exp1', ...x }));
    const result = await service.liquidate('t1', 'o1', { amount: 3000, nextSourceType: 'INVOICE', nextSourceId: 'inv1' });
    expect(encRepo.create).toHaveBeenCalledWith(expect.objectContaining({ type: EncumbranceType.EXPENDITURE, status: EncumbranceStatus.LIQUIDATED, amount: 3000 }));
  });

  it('liquidate — rejects over-balance', async () => {
    encRepo.findOne.mockResolvedValue({
      id: 'c1', type: EncumbranceType.COMMITMENT, status: EncumbranceStatus.OUTSTANDING, amount: 1000, liquidatedAmount: 0,
    });
    await expect(service.liquidate('t1', 'c1', { amount: 5000, nextSourceType: 'GRN', nextSourceId: 'grn1' })).rejects.toThrow(BadRequestException);
  });

  it('liquidate — rejects expenditure liquidation', async () => {
    encRepo.findOne.mockResolvedValue({ id: 'e1', type: EncumbranceType.EXPENDITURE, status: EncumbranceStatus.LIQUIDATED, amount: 100, liquidatedAmount: 100 });
    await expect(service.liquidate('t1', 'e1', { amount: 50, nextSourceType: 'X', nextSourceId: 'y' })).rejects.toThrow(BadRequestException);
  });

  it('liquidate — throws when not found', async () => {
    encRepo.findOne.mockResolvedValue(null);
    await expect(service.liquidate('t1', 'nope', { amount: 50, nextSourceType: 'X', nextSourceId: 'y' })).rejects.toThrow(NotFoundException);
  });

  // ─── reporting ────────────────────────────────────────────────────

  it('balanceReport — computes available per account', async () => {
    budgetRepo.find.mockResolvedValue([{ glAccountId: 'a1', amount: 10000 }]);
    encRepo.find.mockResolvedValue([
      { glAccountId: 'a1', type: EncumbranceType.COMMITMENT, status: EncumbranceStatus.OUTSTANDING, amount: 3000, liquidatedAmount: 0 },
      { glAccountId: 'a1', type: EncumbranceType.EXPENDITURE, status: EncumbranceStatus.LIQUIDATED, amount: 2000, liquidatedAmount: 2000 },
    ]);
    const rows = await service.balanceReport('t1', 2026);
    expect(rows[0]).toMatchObject({ glAccountId: 'a1', budget: 10000, committed: 3000, expended: 2000, available: 5000 });
  });
});
