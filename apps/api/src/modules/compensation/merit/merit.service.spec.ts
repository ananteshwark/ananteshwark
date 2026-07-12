import { BadRequestException } from '@nestjs/common';
import { MeritService } from './merit.service';
import { MeritPlanStatus, MeritCycleType } from './entities/merit-plan.entity';
import { MeritLineStatus } from './entities/merit-line.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', alerts: [], ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('MeritService', () => {
  let service: MeritService;
  let planRepo: any, budgetRepo: any, lineRepo: any, automation: any;

  beforeEach(() => {
    planRepo = mockRepo(); budgetRepo = mockRepo(); lineRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new MeritService(planRepo, budgetRepo, lineRepo, automation);
  });

  const draftPlan = (over: any = {}) => ({
    id: 'p1', tenantId: 't1', name: 'FY26 Merit', cycleType: MeritCycleType.MERIT,
    effectiveDate: '2026-04-01', geographies: [], incrementRanges: [], approverLevels: 1,
    requiresBuApproval: false, requiresChroApproval: false, maxCompaRatio: null,
    status: MeritPlanStatus.DRAFT, createdByUserId: 'u1', ...over,
  });

  it('creates a DRAFT plan and rejects blank names', async () => {
    const plan = await service.createPlan('t1', 'u1', { name: 'FY26 Merit', effectiveDate: '2026-04-01' });
    expect(plan).toMatchObject({ tenantId: 't1', status: MeritPlanStatus.DRAFT, cycleType: MeritCycleType.MERIT });
    await expect(service.createPlan('t1', 'u1', { name: '  ', effectiveDate: '2026-04-01' })).rejects.toThrow(BadRequestException);
  });

  describe('buildIncrementGrid', () => {
    it('scales multipliers so the population-weighted target equals the budget', () => {
      const grid = service.buildIncrementGrid({
        overallBudgetPct: 10,
        spreadPct: 2,
        ratings: [
          { rating: 'EXCEEDS', multiplier: 1.5, populationPct: 20 },
          { rating: 'MEETS', multiplier: 1.0, populationPct: 60 },
          { rating: 'BELOW', multiplier: 0.5, populationPct: 20 },
        ],
      });
      // weightedAvg = .2*1.5 + .6*1.0 + .2*.5 = 1.0 → scale = 10 → targets 15/10/5
      const byRating = Object.fromEntries(grid.map((g) => [g.rating, g]));
      expect(byRating['EXCEEDS'].targetPct).toBe(15);
      expect(byRating['MEETS'].targetPct).toBe(10);
      expect(byRating['BELOW'].targetPct).toBe(5);
      expect(byRating['MEETS']).toMatchObject({ minPct: 8, maxPct: 12 });
      // population-weighted average of the targets returns the budget %
      const weighted = 0.2 * 15 + 0.6 * 10 + 0.2 * 5;
      expect(weighted).toBe(10);
    });

    it('never produces a negative minimum', () => {
      const grid = service.buildIncrementGrid({
        overallBudgetPct: 3, spreadPct: 5,
        ratings: [{ rating: 'MEETS', multiplier: 1, populationPct: 100 }],
      });
      expect(grid[0].minPct).toBe(0);
    });

    it('rejects empty ratings and non-positive population', () => {
      expect(() => service.buildIncrementGrid({ overallBudgetPct: 5, ratings: [] })).toThrow(BadRequestException);
      expect(() => service.buildIncrementGrid({ overallBudgetPct: 5, ratings: [{ rating: 'X', multiplier: 1, populationPct: 0 }] })).toThrow(BadRequestException);
    });
  });

  describe('plan lifecycle', () => {
    it('walks DRAFT → HRBP_REVIEW → LAUNCHED and emits merit.launched', async () => {
      const plan = draftPlan({ incrementRanges: [{ rating: 'MEETS', minPct: 8, maxPct: 12, targetPct: 10 }] });
      planRepo.findOne.mockResolvedValue(plan);
      const reviewed = await service.submitForHrbpReview('t1', 'p1');
      expect(reviewed.status).toBe(MeritPlanStatus.HRBP_REVIEW);

      planRepo.findOne.mockResolvedValue({ ...plan, status: MeritPlanStatus.HRBP_REVIEW });
      const launched = await service.launch('t1', 'p1');
      expect(launched.status).toBe(MeritPlanStatus.LAUNCHED);
      expect(launched.launchedAt).toBeInstanceOf(Date);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'merit.launched', expect.objectContaining({ planId: 'p1' }));
    });

    it('blocks HRBP review without an increment grid', async () => {
      planRepo.findOne.mockResolvedValue(draftPlan());
      await expect(service.submitForHrbpReview('t1', 'p1')).rejects.toThrow(BadRequestException);
    });

    it('only reconfigures DRAFT plans', async () => {
      planRepo.findOne.mockResolvedValue(draftPlan({ status: MeritPlanStatus.LAUNCHED }));
      await expect(service.configurePlan('t1', 'p1', { maxCompaRatio: 1.2 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('budget tree', () => {
    it('rejects child allocations exceeding the parent budget', async () => {
      budgetRepo.findOne.mockResolvedValue({ id: 'b0', tenantId: 't1', planId: 'p1', allocatedAmount: 1000 });
      await expect(service.redistributeBudget('t1', 'b0', [{ nodeId: 'b1', amount: 700 }, { nodeId: 'b2', amount: 500 }]))
        .rejects.toThrow(BadRequestException);
    });

    it('redistributes within budget', async () => {
      budgetRepo.findOne
        .mockResolvedValueOnce({ id: 'b0', tenantId: 't1', planId: 'p1', allocatedAmount: 1000 })
        .mockResolvedValueOnce({ id: 'b1', tenantId: 't1', parentId: 'b0', allocatedAmount: 0 })
        .mockResolvedValueOnce({ id: 'b2', tenantId: 't1', parentId: 'b0', allocatedAmount: 0 });
      const updated = await service.redistributeBudget('t1', 'b0', [{ nodeId: 'b1', amount: 600 }, { nodeId: 'b2', amount: 400 }]);
      expect(updated.map((n) => n.allocatedAmount)).toEqual([600, 400]);
    });

    it('rolls up consumption and flags over-budget nodes', async () => {
      budgetRepo.find.mockResolvedValue([{ id: 'b1', name: 'Eng', allocatedAmount: 1000 }]);
      lineRepo.find.mockResolvedValue([
        { budgetId: 'b1', proposedAmount: 700 },
        { budgetId: 'b1', proposedAmount: 500 },
      ]);
      const rows = await service.budgetConsumption('t1', 'p1');
      expect(rows[0]).toMatchObject({ nodeId: 'b1', allocated: 1000, consumed: 1200, remaining: -200, overBudget: true });
    });
  });

  describe('proposeIncrement + alerts', () => {
    const launchedPlan = (over: any = {}) => draftPlan({
      status: MeritPlanStatus.LAUNCHED,
      incrementRanges: [{ rating: 'MEETS', minPct: 8, maxPct: 12, targetPct: 10 }],
      ...over,
    });

    it('computes new salary, compa-ratio and raises no alert inside the band', async () => {
      lineRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: 't1', planId: 'p1', budgetId: null, currentSalary: 100000,
        performanceRating: 'MEETS', rangeMidpoint: 110000, status: MeritLineStatus.PENDING,
      });
      planRepo.findOne.mockResolvedValue(launchedPlan());
      const line = await service.proposeIncrement('t1', 'l1', { proposedPct: 10 });
      expect(line.proposedAmount).toBe(10000);
      expect(line.newSalary).toBe(110000);
      expect(line.newCompaRatio).toBe(1);
      expect(line.status).toBe(MeritLineStatus.PROPOSED);
      expect(line.alerts).toHaveLength(0);
    });

    it('raises DISCRETION_BREACH outside the rating band', async () => {
      lineRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: 't1', planId: 'p1', budgetId: null, currentSalary: 100000,
        performanceRating: 'MEETS', rangeMidpoint: null, status: MeritLineStatus.PENDING,
      });
      planRepo.findOne.mockResolvedValue(launchedPlan());
      const line = await service.proposeIncrement('t1', 'l1', { proposedPct: 20 });
      expect(line.alerts.map((a) => a.type)).toContain('DISCRETION_BREACH');
    });

    it('raises PAY_RANGE_BREACH over the plan compa-ratio cap', async () => {
      lineRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: 't1', planId: 'p1', budgetId: null, currentSalary: 100000,
        performanceRating: 'MEETS', rangeMidpoint: 100000, status: MeritLineStatus.PENDING,
      });
      planRepo.findOne.mockResolvedValue(launchedPlan({ maxCompaRatio: 1.05 }));
      const line = await service.proposeIncrement('t1', 'l1', { proposedPct: 10 });
      expect(line.alerts.map((a) => a.type)).toContain('PAY_RANGE_BREACH');
    });

    it('raises BUDGET_OVERRUN when the node runs over', async () => {
      lineRepo.findOne.mockResolvedValue({
        id: 'l1', tenantId: 't1', planId: 'p1', budgetId: 'b1', currentSalary: 100000,
        performanceRating: 'MEETS', rangeMidpoint: null, status: MeritLineStatus.PENDING,
      });
      planRepo.findOne.mockResolvedValue(launchedPlan());
      budgetRepo.findOne.mockResolvedValue({ id: 'b1', name: 'Eng', allocatedAmount: 5000, tenantId: 't1' });
      lineRepo.find.mockResolvedValue([{ id: 'l1', proposedAmount: 0 }]);
      const line = await service.proposeIncrement('t1', 'l1', { proposedPct: 10 });
      expect(line.alerts.map((a) => a.type)).toContain('BUDGET_OVERRUN');
    });

    it('refuses proposals on a non-LAUNCHED plan', async () => {
      lineRepo.findOne.mockResolvedValue({ id: 'l1', tenantId: 't1', planId: 'p1', currentSalary: 100000 });
      planRepo.findOne.mockResolvedValue(draftPlan());
      await expect(service.proposeIncrement('t1', 'l1', { proposedPct: 5 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('biasScreen', () => {
    it('flags a rating whose demographic gap exceeds the threshold', async () => {
      lineRepo.find.mockResolvedValue([
        { performanceRating: 'MEETS', demographic: 'F', proposedPct: 4, status: MeritLineStatus.PROPOSED },
        { performanceRating: 'MEETS', demographic: 'F', proposedPct: 4, status: MeritLineStatus.PROPOSED },
        { performanceRating: 'MEETS', demographic: 'M', proposedPct: 10, status: MeritLineStatus.PROPOSED },
      ]);
      const result = await service.biasScreen('t1', 'p1', 2);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ rating: 'MEETS', gap: 6, flagged: true });
    });

    it('ignores ratings with a single demographic group', async () => {
      lineRepo.find.mockResolvedValue([
        { performanceRating: 'MEETS', demographic: 'F', proposedPct: 4, status: MeritLineStatus.PROPOSED },
      ]);
      expect(await service.biasScreen('t1', 'p1')).toHaveLength(0);
    });
  });

  describe('approval & outputs', () => {
    it('blocks approval while proposed lines remain', async () => {
      planRepo.findOne.mockResolvedValue(draftPlan({ status: MeritPlanStatus.LAUNCHED }));
      lineRepo.find.mockResolvedValue([{ id: 'l1', status: MeritLineStatus.PROPOSED }]);
      await expect(service.approvePlan('t1', 'p1')).rejects.toThrow(BadRequestException);
    });

    it('drafts a MERIT_INCREMENT letter per approved employee when the letters module is wired', async () => {
      const letters: any = {
        generateByCode: jest.fn().mockResolvedValue({ id: 'ltr1', letterNumber: 'LTR-000001' }),
      };
      const wired = new MeritService(planRepo, budgetRepo, lineRepo, automation, letters);
      planRepo.findOne.mockResolvedValue(draftPlan({ status: MeritPlanStatus.LAUNCHED }));
      lineRepo.find.mockResolvedValue([
        { id: 'l1', employeeId: 'e1', employeeName: 'Ann', currency: 'USD', currentSalary: 100000, newSalary: 110000, proposedPct: 10, proposedAmount: 10000, status: MeritLineStatus.APPROVED },
      ]);
      const { outputs } = await wired.approvePlan('t1', 'p1');
      expect(letters.generateByCode).toHaveBeenCalledWith('t1', expect.objectContaining({
        code: 'MERIT_INCREMENT', employeeId: 'e1',
        data: expect.objectContaining({ newSalary: 110000 }),
      }));
      expect(outputs[0]).toMatchObject({ letterId: 'ltr1', letterNumber: 'LTR-000001' });
    });

    it('a missing letter template or render failure never blocks approval', async () => {
      const letters: any = { generateByCode: jest.fn().mockRejectedValue(new Error('no such employee')) };
      const wired = new MeritService(planRepo, budgetRepo, lineRepo, automation, letters);
      planRepo.findOne.mockResolvedValue(draftPlan({ status: MeritPlanStatus.LAUNCHED }));
      lineRepo.find.mockResolvedValue([
        { id: 'l1', employeeId: 'e1', employeeName: 'Ann', currency: 'USD', currentSalary: 100000, newSalary: 110000, proposedPct: 10, proposedAmount: 10000, status: MeritLineStatus.APPROVED },
      ]);
      const { plan, outputs } = await wired.approvePlan('t1', 'p1');
      expect(plan.status).toBe(MeritPlanStatus.APPROVED);
      expect(outputs[0].letterId).toBeUndefined();
    });

    it('approves the plan, builds outputs with letter data and emits merit.approved', async () => {
      planRepo.findOne.mockResolvedValue(draftPlan({ status: MeritPlanStatus.LAUNCHED }));
      lineRepo.find.mockResolvedValue([
        { id: 'l1', employeeId: 'e1', employeeName: 'Ann', currency: 'USD', currentSalary: 100000, newSalary: 110000, proposedPct: 10, proposedAmount: 10000, status: MeritLineStatus.APPROVED },
        { id: 'l2', status: MeritLineStatus.REJECTED },
      ]);
      const { plan, outputs } = await service.approvePlan('t1', 'p1');
      expect(plan.status).toBe(MeritPlanStatus.APPROVED);
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).toMatchObject({ employeeId: 'e1', newSalary: 110000, increaseAmount: 10000 });
      expect(outputs[0].letter).toMatchObject({ template: 'MERIT_INCREMENT' });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'merit.approved', expect.objectContaining({ awardedCount: 1, totalAward: 10000 }));
    });
  });
});
