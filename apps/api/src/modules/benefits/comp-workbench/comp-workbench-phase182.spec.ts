import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompWorkbenchService } from './comp-workbench.service';
import { CompBudget, AwardType } from './entities/comp-budget.entity';
import { CompAward, AwardStatus } from './entities/comp-award.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('CompWorkbenchService — Phase 182-186', () => {
  let service: CompWorkbenchService;
  let budgetRepo: any, awardRepo: any;

  beforeEach(async () => {
    budgetRepo = mockRepo(); awardRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        CompWorkbenchService,
        { provide: getRepositoryToken(CompBudget), useValue: budgetRepo },
        { provide: getRepositoryToken(CompAward), useValue: awardRepo },
      ],
    }).compile();
    service = module.get(CompWorkbenchService);
  });

  // ─── Ph-182: budget envelopes ─────────────────────────────────────

  it('createBudget — rejects duplicate envelope', async () => {
    budgetRepo.findOne.mockResolvedValue({ id: 'b1' });
    await expect(service.createBudget('t1', { cycleId: 'c1', orgUnitId: 'o1', awardType: AwardType.MERIT, budgetAmount: 1000 }))
      .rejects.toThrow(BadRequestException);
  });

  it('createBudget — rejects negative budget', async () => {
    await expect(service.createBudget('t1', { cycleId: 'c1', orgUnitId: 'o1', awardType: AwardType.MERIT, budgetAmount: -5 }))
      .rejects.toThrow(BadRequestException);
  });

  it('createBudget — creates with zero allocated', async () => {
    budgetRepo.findOne.mockResolvedValue(null);
    await service.createBudget('t1', { cycleId: 'c1', orgUnitId: 'o1', awardType: AwardType.MERIT, budgetAmount: 1000 });
    expect(budgetRepo.create).toHaveBeenCalledWith(expect.objectContaining({ allocatedAmount: 0, currency: 'USD' }));
  });

  // ─── Ph-183: worksheet ────────────────────────────────────────────

  it('proposeAward — blocks over-budget award', async () => {
    budgetRepo.findOne.mockResolvedValue({ id: 'b1', orgUnitId: 'o1', budgetAmount: 1000, allocatedAmount: 800 });
    await expect(service.proposeAward('t1', { cycleId: 'c1', budgetId: 'b1', employeeId: 'e1', awardType: AwardType.MERIT, amount: 300 }))
      .rejects.toThrow(BadRequestException);
  });

  it('proposeAward — reserves amount against envelope', async () => {
    const budget = { id: 'b1', orgUnitId: 'o1', budgetAmount: 1000, allocatedAmount: 200 };
    budgetRepo.findOne.mockResolvedValue(budget);
    await service.proposeAward('t1', { cycleId: 'c1', budgetId: 'b1', employeeId: 'e1', awardType: AwardType.MERIT, amount: 300 });
    expect(budget.allocatedAmount).toBe(500);
    expect(budgetRepo.save).toHaveBeenCalledWith(budget);
  });

  it('proposeAward — throws when budget missing', async () => {
    budgetRepo.findOne.mockResolvedValue(null);
    await expect(service.proposeAward('t1', { cycleId: 'c1', budgetId: 'nope', employeeId: 'e1', awardType: AwardType.MERIT, amount: 10 }))
      .rejects.toThrow(NotFoundException);
  });

  // ─── Ph-184: approval workflow ────────────────────────────────────

  it('submit — moves DRAFT to SUBMITTED', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.DRAFT, approvalHistory: [] });
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const a = await service.submit('t1', 'a1', 'u1');
    expect(a.status).toBe(AwardStatus.SUBMITTED);
  });

  it('approve — advances SUBMITTED → HR_REVIEW → FINANCE_REVIEW → APPROVED', async () => {
    const award: any = { id: 'a1', status: AwardStatus.SUBMITTED, approvalHistory: [] };
    awardRepo.findOne.mockResolvedValue(award);
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    expect((await service.approve('t1', 'a1', 'u1')).status).toBe(AwardStatus.HR_REVIEW);
    expect((await service.approve('t1', 'a1', 'u1')).status).toBe(AwardStatus.FINANCE_REVIEW);
    expect((await service.approve('t1', 'a1', 'u1')).status).toBe(AwardStatus.APPROVED);
  });

  it('approve — rejects approving an already-approved award', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.APPROVED, approvalHistory: [] });
    await expect(service.approve('t1', 'a1', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('reject — moves in-review award to REJECTED', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.HR_REVIEW, approvalHistory: [] });
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const a = await service.reject('t1', 'a1', 'u1', 'too high');
    expect(a.status).toBe(AwardStatus.REJECTED);
    expect(a.notes).toBe('too high');
  });

  // ─── Ph-185: execution ────────────────────────────────────────────

  it('execute — rejects non-APPROVED award', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.SUBMITTED });
    await expect(service.execute('t1', 'a1', 'chg1')).rejects.toThrow(BadRequestException);
  });

  it('execute — links assignment change on APPROVED award', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.APPROVED, assignmentChangeId: null });
    awardRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const a = await service.execute('t1', 'a1', 'chg1');
    expect(a.assignmentChangeId).toBe('chg1');
  });

  it('execute — rejects double execution', async () => {
    awardRepo.findOne.mockResolvedValue({ id: 'a1', status: AwardStatus.APPROVED, assignmentChangeId: 'chg0' });
    await expect(service.execute('t1', 'a1', 'chg1')).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-186: total compensation statement ─────────────────────────

  it('totalCompStatement — aggregates base + awards + benefits', async () => {
    awardRepo.find.mockResolvedValue([
      { awardType: AwardType.MERIT, amount: 5000, status: AwardStatus.APPROVED },
      { awardType: AwardType.BONUS, amount: 10000, status: AwardStatus.APPROVED },
      { awardType: AwardType.EQUITY, amount: 20000, status: AwardStatus.APPROVED },
    ]);
    const s = await service.totalCompStatement('t1', 'e1', 100000, 8000);
    expect(s.meritIncrease).toBe(5000);
    expect(s.bonus).toBe(10000);
    expect(s.equityValue).toBe(20000);
    expect(s.totalCash).toBe(115000); // 100000 + 5000 + 10000
    expect(s.totalCompensation).toBe(143000); // + 20000 equity + 8000 benefits
  });
});
