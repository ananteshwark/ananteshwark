import { BadRequestException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpenseClaimStatus } from './entities/expense-claim.entity';
import { ExpenseLineType } from './entities/expense-line.entity';
import { ExpenseRateType } from './entities/expense-rate.entity';

/**
 * Phase 1 expense depth: rate-card lines (per-diem/mileage), policy
 * enforcement at submission, claim splitting, advance offset with net
 * payout, and budget consumption alerts.
 */
describe('ExpensesService — depth', () => {
  let service: ExpensesService;
  let categoryRepo: any, claimRepo: any, lineRepo: any, policyRepo: any, glService: any;
  let rateRepo: any, budgetRepo: any, employeeRepo: any, automation: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: x.id ?? `gen-${Math.random().toString(36).slice(2, 6)}`, ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  });

  const numberQb = () => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ max: '10' }),
  });

  beforeEach(() => {
    categoryRepo = mockRepo(); claimRepo = mockRepo(); lineRepo = mockRepo(); policyRepo = mockRepo();
    rateRepo = mockRepo(); budgetRepo = mockRepo(); employeeRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    glService = { findAccounts: jest.fn().mockResolvedValue({ items: [] }), postJournalEntry: jest.fn() };
    claimRepo.createQueryBuilder.mockReturnValue(numberQb());
    service = new ExpensesService(
      categoryRepo, claimRepo, lineRepo, policyRepo, glService,
      automation, rateRepo, budgetRepo, employeeRepo,
    );
  });

  describe('rate-card lines', () => {
    it('computes per-diem and mileage amounts from rate × quantity', async () => {
      rateRepo.findOne
        .mockResolvedValueOnce({ id: 'r-pd', rateType: ExpenseRateType.PER_DIEM, rate: 2500, name: 'Metro per-diem' })
        .mockResolvedValueOnce({ id: 'r-km', rateType: ExpenseRateType.MILEAGE, rate: 12, name: 'Car per km' });
      claimRepo.findOne.mockResolvedValue({ id: 'gen-1', status: ExpenseClaimStatus.DRAFT });
      lineRepo.find.mockResolvedValue([]);
      await service.createClaim('t1', 'e1', {
        title: 'Client visit',
        lines: [
          { lineType: ExpenseLineType.PER_DIEM, rateId: 'r-pd', quantity: 3, description: '3 days Mumbai', expenseDate: '2026-07-01' },
          { lineType: ExpenseLineType.MILEAGE, rateId: 'r-km', quantity: 120, description: '120 km', expenseDate: '2026-07-01' },
        ],
      });
      expect(claimRepo.create).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 8940 })); // 7500 + 1440
      const savedLines = lineRepo.save.mock.calls[0][0];
      expect(savedLines[0]).toMatchObject({ amount: 7500, lineType: 'PER_DIEM', quantity: 3, rateId: 'r-pd' });
      expect(savedLines[1]).toMatchObject({ amount: 1440, lineType: 'MILEAGE', quantity: 120, rateId: 'r-km' });
    });

    it('rejects a mileage line pointing at a per-diem rate, and missing quantities', async () => {
      rateRepo.findOne.mockResolvedValue({ id: 'r-pd', rateType: ExpenseRateType.PER_DIEM, rate: 2500, name: 'Metro' });
      await expect(service.createClaim('t1', 'e1', {
        title: 'X', lines: [{ lineType: ExpenseLineType.MILEAGE, rateId: 'r-pd', quantity: 10, description: 'd', expenseDate: '2026-07-01' }],
      })).rejects.toThrow('expected MILEAGE');
      await expect(service.createClaim('t1', 'e1', {
        title: 'X', lines: [{ lineType: ExpenseLineType.PER_DIEM, description: 'd', expenseDate: '2026-07-01' }],
      })).rejects.toThrow('rateId and a positive quantity');
    });

    it('createRate validates and lists filter by type', async () => {
      await expect(service.createRate('t1', { name: 'X', classifier: 'METRO', rate: 0, rateType: ExpenseRateType.PER_DIEM }))
        .rejects.toThrow(BadRequestException);
      const rate = await service.createRate('t1', { name: 'Metro', classifier: 'METRO', rate: 2500, rateType: ExpenseRateType.PER_DIEM });
      expect(rate.tenantId).toBe('t1');
      await service.listRates('t1', ExpenseRateType.MILEAGE);
      expect(rateRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ rateType: ExpenseRateType.MILEAGE }),
      }));
    });
  });

  describe('policy enforcement at submission', () => {
    const draftClaim = (total: number) => ({
      id: 'c1', tenantId: 't1', employeeId: 'e1', status: ExpenseClaimStatus.DRAFT,
      totalAmount: total, claimNumber: 'EXP-000011',
    });

    it('rejects claims above the matching policy cap', async () => {
      claimRepo.findOne.mockResolvedValue(draftClaim(60000));
      lineRepo.find.mockResolvedValue([]);
      policyRepo.find.mockResolvedValue([{ name: 'Standard', isActive: true, appliesTo: null, maxClaimAmount: 50000, categoryLimits: [] }]);
      await expect(service.submitClaim('t1', 'c1')).rejects.toThrow('exceeds the Standard limit');
    });

    it('enforces per-category line limits', async () => {
      claimRepo.findOne.mockResolvedValue(draftClaim(9000));
      lineRepo.find.mockResolvedValue([
        { lineNumber: 1, description: 'Hotel', categoryId: 'cat-hotel', amount: 9000 },
      ]);
      policyRepo.find.mockResolvedValue([{
        name: 'Standard', appliesTo: null, maxClaimAmount: null,
        categoryLimits: [{ categoryId: 'cat-hotel', maxAmount: 6000 }],
      }]);
      await expect(service.submitClaim('t1', 'c1')).rejects.toThrow('category limit of 6000');
    });

    it('skips policies whose appliesTo does not match the claimant', async () => {
      claimRepo.findOne.mockResolvedValue(draftClaim(60000));
      lineRepo.find.mockResolvedValue([]);
      employeeRepo.findOne.mockResolvedValue({ id: 'e1', departmentId: 'dept-eng' });
      policyRepo.find.mockResolvedValue([
        { name: 'Sales only', appliesTo: { departments: ['dept-sales'] }, maxClaimAmount: 10000, categoryLimits: [] },
      ]);
      const claim = await service.submitClaim('t1', 'c1'); // no matching policy → allowed
      expect(claim.status).toBe(ExpenseClaimStatus.SUBMITTED);
    });
  });

  describe('split and advance offset', () => {
    it('splits a DRAFT claim proportionally and keeps the remainder', async () => {
      claimRepo.findOne.mockResolvedValue({
        id: 'c1', tenantId: 't1', employeeId: 'e1', status: ExpenseClaimStatus.DRAFT,
        title: 'Team dinner', claimDate: '2026-07-01', currency: 'INR', totalAmount: 3000, claimNumber: 'EXP-000011',
      });
      lineRepo.find.mockResolvedValue([
        { lineNumber: 1, description: 'Dinner', categoryId: null, expenseDate: '2026-07-01', amount: 3000, taxAmount: 0, currency: 'INR', lineType: 'GENERAL' },
      ]);
      const { original, created } = await service.splitClaim('t1', 'c1', [
        { employeeId: 'e2', sharePct: 30 },
        { employeeId: 'e3', sharePct: 20 },
      ]);
      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({ employeeId: 'e2', totalAmount: 900, splitFromClaimId: 'c1' });
      expect(created[1]).toMatchObject({ employeeId: 'e3', totalAmount: 600 });
      expect(Number(original.totalAmount)).toBe(1500); // 50% remainder
    });

    it('rejects splits totalling 100% or more, and non-DRAFT claims', async () => {
      claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.DRAFT, totalAmount: 100 });
      lineRepo.find.mockResolvedValue([]);
      await expect(service.splitClaim('t1', 'c1', [{ employeeId: 'e2', sharePct: 100 }]))
        .rejects.toThrow('less than 100%');
      claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.SUBMITTED, totalAmount: 100 });
      await expect(service.splitClaim('t1', 'c1', [{ employeeId: 'e2', sharePct: 10 }]))
        .rejects.toThrow('Only DRAFT');
    });

    it('records an advance offset and pays out the net amount', async () => {
      claimRepo.findOne.mockResolvedValue({
        id: 'c1', tenantId: 't1', employeeId: 'e1', status: ExpenseClaimStatus.APPROVED,
        totalAmount: 5000, claimNumber: 'EXP-000011', currency: 'INR',
      });
      const withOffset = await service.applyAdvanceOffset('t1', 'c1', { advanceId: 'adv-9', amount: 2000 });
      expect(withOffset).toMatchObject({ advanceId: 'adv-9', advanceDeduction: 2000 });

      claimRepo.findOne.mockResolvedValue({ ...withOffset, status: ExpenseClaimStatus.APPROVED });
      lineRepo.find.mockResolvedValue([]);
      await service.markPaid('t1', 'c1', 'u1');
      expect(automation.emit).toHaveBeenCalledWith('t1', 'expense.paid', expect.objectContaining({
        totalAmount: 5000, advanceDeduction: 2000, netPaid: 3000,
      }));
    });

    it('rejects offsets above the claim total or on unapproved claims', async () => {
      claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.APPROVED, totalAmount: 1000 });
      await expect(service.applyAdvanceOffset('t1', 'c1', { advanceId: 'a', amount: 1500 }))
        .rejects.toThrow('exceeds the claim total');
      claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.DRAFT, totalAmount: 1000 });
      await expect(service.applyAdvanceOffset('t1', 'c1', { advanceId: 'a', amount: 100 }))
        .rejects.toThrow('APPROVED');
    });
  });

  describe('budgets', () => {
    const consumptionQb = (sum: number) => ({
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ sum: String(sum) }),
    });

    it('reports consumption per budget and flags threshold crossings', async () => {
      budgetRepo.find.mockResolvedValue([
        { id: 'b1', categoryId: 'cat-travel', year: 2026, amount: 10000, alertThresholdPct: 80, isActive: true },
        { id: 'b2', categoryId: null, year: 2026, amount: 100000, alertThresholdPct: 80, isActive: true },
      ]);
      lineRepo.createQueryBuilder
        .mockReturnValueOnce(consumptionQb(8500))
        .mockReturnValueOnce(consumptionQb(20000));
      const rows = await service.budgetStatus('t1', 2026);
      expect(rows[0]).toMatchObject({ budgetId: 'b1', consumed: 8500, consumedPct: 85, alert: true });
      expect(rows[1]).toMatchObject({ budgetId: 'b2', consumedPct: 20, alert: false });
    });

    it('approval emits expense.budget_alert for crossed budgets', async () => {
      claimRepo.findOne.mockResolvedValue({
        id: 'c1', tenantId: 't1', employeeId: 'e1', status: ExpenseClaimStatus.SUBMITTED,
        totalAmount: 500, claimNumber: 'EXP-000011', claimDate: '2026-07-01',
      });
      budgetRepo.find.mockResolvedValue([
        { id: 'b1', categoryId: null, year: 2026, amount: 1000, alertThresholdPct: 80, isActive: true },
      ]);
      lineRepo.createQueryBuilder.mockReturnValue(consumptionQb(900));
      await service.approveClaim('t1', 'c1', 'mgr1');
      expect(automation.emit).toHaveBeenCalledWith('t1', 'expense.budget_alert', expect.objectContaining({
        budgetId: 'b1', consumedPct: 90, thresholdPct: 80,
      }));
    });
  });
});
