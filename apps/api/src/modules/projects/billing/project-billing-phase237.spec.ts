import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectBillingService } from './project-billing.service';
import { ProjectBudget, BudgetStatus } from './entities/project-budget.entity';
import { ProjectBudgetLine } from './entities/project-budget-line.entity';
import { BillingRate } from './entities/billing-rate.entity';
import { RevenueRecognitionEntry, RecognitionMethod } from './entities/revenue-recognition.entity';
import { ProjectTimeEntry } from '../entities/project-time-entry.entity';
import { ProjectExpense, ProjectExpenseStatus } from '../entities/project-expense.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('ProjectBillingService — Phase 237-241', () => {
  let service: ProjectBillingService;
  let budgetRepo: any, lineRepo: any, rateRepo: any, recogRepo: any, timeRepo: any, expenseRepo: any;

  beforeEach(async () => {
    budgetRepo = mockRepo(); lineRepo = mockRepo(); rateRepo = mockRepo(); recogRepo = mockRepo(); timeRepo = mockRepo(); expenseRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        ProjectBillingService,
        { provide: getRepositoryToken(ProjectBudget), useValue: budgetRepo },
        { provide: getRepositoryToken(ProjectBudgetLine), useValue: lineRepo },
        { provide: getRepositoryToken(BillingRate), useValue: rateRepo },
        { provide: getRepositoryToken(RevenueRecognitionEntry), useValue: recogRepo },
        { provide: getRepositoryToken(ProjectTimeEntry), useValue: timeRepo },
        { provide: getRepositoryToken(ProjectExpense), useValue: expenseRepo },
      ],
    }).compile();
    service = module.get(ProjectBillingService);
  });

  // ─── Ph-237: budgets ──────────────────────────────────────────────

  it('createBudget — baseline version 1 with total', async () => {
    budgetRepo.findOne.mockResolvedValue(null);
    budgetRepo.save.mockImplementation((x: any) => Promise.resolve({ id: 'b1', ...x }));
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.createBudget('t1', 'p1', [{ taskId: 'task1', budgetAmount: 1000 }, { taskId: 'task2', budgetAmount: 500 }]);
    expect(r.budget.version).toBe(1);
    expect(r.budget.status).toBe(BudgetStatus.BASELINE);
    expect(r.budget.totalAmount).toBe(1500);
  });

  it('createBudget — rejects when a budget already exists', async () => {
    budgetRepo.findOne.mockResolvedValue({ id: 'b1', version: 1 });
    await expect(service.createBudget('t1', 'p1', [{ budgetAmount: 1 }])).rejects.toThrow(BadRequestException);
  });

  it('reviseBudget — archives prior and bumps version', async () => {
    budgetRepo.findOne.mockResolvedValue({ id: 'b1', version: 1, status: BudgetStatus.BASELINE });
    budgetRepo.save.mockImplementation((x: any) => Promise.resolve({ id: x.id ?? 'b2', ...x }));
    lineRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.reviseBudget('t1', 'p1', [{ budgetAmount: 2000 }]);
    expect(r.budget.version).toBe(2);
    expect(r.budget.status).toBe(BudgetStatus.REVISED);
  });

  // ─── Ph-238: budget vs actual ─────────────────────────────────────

  it('budgetVsActual — actual = hours × resolved rate; EAC floors at budget', async () => {
    budgetRepo.findOne.mockResolvedValue({ id: 'b1' });
    lineRepo.find.mockResolvedValue([{ taskId: 'task1', budgetAmount: 1000 }]);
    rateRepo.find.mockResolvedValue([{ projectId: 'p1', resourceId: null, ratePerHour: 100 }]);
    timeRepo.find.mockResolvedValue([{ taskId: 'task1', employeeId: 'e1', hours: 6 }]);
    expenseRepo.find.mockResolvedValue([{ amount: 50 }]);
    const r = await service.budgetVsActual('t1', 'p1');
    expect(r.tasks[0].actual).toBe(600); // 6 × 100
    expect(r.tasks[0].variance).toBe(400);
    expect(r.tasks[0].eac).toBe(1000); // max(budget, actual)
    expect(r.totalActual).toBe(650); // 600 + 50 expense
  });

  // ─── Ph-239: T&M billing ──────────────────────────────────────────

  it('generateTmInvoice — bills billable time and approved expenses only', async () => {
    rateRepo.find.mockResolvedValue([{ projectId: 'p1', resourceId: 'e1', ratePerHour: 150 }]);
    timeRepo.find.mockResolvedValue([
      { employeeId: 'e1', date: '2026-06-10', hours: 8, billable: true },
      { employeeId: 'e1', date: '2026-06-11', hours: 2, billable: false },
    ]);
    expenseRepo.find.mockResolvedValue([
      { description: 'Travel', date: '2026-06-10', amount: 300, status: ProjectExpenseStatus.APPROVED },
      { description: 'Snacks', date: '2026-06-10', amount: 50, status: ProjectExpenseStatus.PENDING },
    ]);
    const r = await service.generateTmInvoice('t1', 'p1', '2026-06-01', '2026-06-30');
    expect(r.laborTotal).toBe(1200); // 8 × 150 (non-billable excluded)
    expect(r.expenseTotal).toBe(300); // pending excluded
    expect(r.total).toBe(1500);
  });

  // ─── Ph-240: fixed-price schedule ─────────────────────────────────

  it('fixedPriceSchedule — splits contract by milestone percentages', () => {
    const r = service.fixedPriceSchedule(100000, [{ name: 'Kickoff', pct: 20 }, { name: 'Delivery', pct: 80 }]);
    expect(r.schedule[0].amount).toBe(20000);
    expect(r.schedule[1].amount).toBe(80000);
    expect(r.schedule[1].cumulative).toBe(100000);
  });

  it('fixedPriceSchedule — rejects percentages not summing to 100', () => {
    expect(() => service.fixedPriceSchedule(100, [{ name: 'A', pct: 60 }, { name: 'B', pct: 30 }])).toThrow(BadRequestException);
  });

  // ─── Ph-241: revenue recognition ──────────────────────────────────

  it('recognizePoc — recognizes incremental earned revenue', async () => {
    recogRepo.find.mockResolvedValue([{ recognizedAmount: 20000 }]); // prior cumulative
    recogRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.recognizePoc('t1', { projectId: 'p1', period: '2026-06', contractValue: 100000, costToDate: 50000, estimatedTotalCost: 100000 });
    expect(r.pocPct).toBe(50);
    expect(r.recognizedAmount).toBe(30000); // 50000 earned − 20000 prior
    expect(r.cumulativeRecognized).toBe(50000);
    expect(r.method).toBe(RecognitionMethod.POC);
  });

  it('recognizePoc — rejects zero estimated cost', async () => {
    await expect(service.recognizePoc('t1', { projectId: 'p1', period: '2026-06', contractValue: 100, costToDate: 10, estimatedTotalCost: 0 })).rejects.toThrow(BadRequestException);
  });

  it('recognizeCompleted — recognizes remaining contract value', async () => {
    recogRepo.find.mockResolvedValue([{ recognizedAmount: 40000 }]);
    recogRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.recognizeCompleted('t1', { projectId: 'p1', period: '2026-06', contractValue: 100000 });
    expect(r.recognizedAmount).toBe(60000);
    expect(r.cumulativeRecognized).toBe(100000);
  });
});
