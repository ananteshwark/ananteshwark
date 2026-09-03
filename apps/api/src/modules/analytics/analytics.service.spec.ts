import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { BudgetStatus } from './entities/budget.entity';
import { ScheduleFrequency } from './entities/report-schedule.entity';

/**
 * Analytics: report execution always tenant-scoped ($1 injection when the
 * query lacks it), budget totals + variance vs posted actuals, DRAFT-only
 * approval, and KPI evaluation with the ±5% target band.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let reportRepo: any, scheduleRepo: any, budgetRepo: any, kpiRepo: any, dataSource: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  });

  beforeEach(() => {
    reportRepo = mockRepo(); scheduleRepo = mockRepo(); budgetRepo = mockRepo(); kpiRepo = mockRepo();
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    service = new AnalyticsService(reportRepo, scheduleRepo, budgetRepo, kpiRepo, dataSource);
  });

  it('runReport injects tenant scoping when the query has no $1 placeholder', async () => {
    reportRepo.findOne.mockResolvedValue({
      id: 'r1', tenantId: 't1', columns: [], sqlQuery: 'SELECT * FROM fin_journal_entries WHERE status = \'POSTED\'',
    });
    await service.runReport('t1', 'r1', {} as any);
    const [query, params] = dataSource.query.mock.calls[0];
    expect(query).toContain('WHERE tenant_id = $1 AND');
    expect(params).toEqual(['t1']);
  });

  it('runReport binds named parameters positionally', async () => {
    reportRepo.findOne.mockResolvedValue({
      id: 'r1', tenantId: 't1', columns: [], sqlQuery: 'SELECT * FROM t WHERE tenant_id = $1 AND month = :month',
    });
    await service.runReport('t1', 'r1', { parameters: { month: '2026-07' } } as any);
    const [query, params] = dataSource.query.mock.calls[0];
    expect(query).toContain('month = $2');
    expect(params).toEqual(['t1', '2026-07']);
  });

  it('runReport wraps SQL failures in a 400', async () => {
    reportRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', columns: [], sqlQuery: 'SELECT 1 WHERE tenant_id = $1' });
    dataSource.query.mockRejectedValue(new Error('syntax error'));
    await expect(service.runReport('t1', 'r1', {} as any)).rejects.toThrow(BadRequestException);
  });

  it('createSchedule computes the next run from the frequency', async () => {
    const s = await service.createSchedule('t1', { frequency: ScheduleFrequency.WEEKLY } as any);
    const days = (s.nextRunAt.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it('createBudget totals the lines; approve requires DRAFT', async () => {
    const b = await service.createBudget('t1', {
      lines: [{ budgetAmount: 1000 }, { budgetAmount: 500 }],
    } as any);
    expect(b.totalBudget).toBe(1500);

    budgetRepo.findOne.mockResolvedValue({ id: 'b1', tenantId: 't1', status: BudgetStatus.APPROVED });
    await expect(service.approveBudget('t1', 'b1')).rejects.toThrow(BadRequestException);
  });

  it('getBudgetVariance compares each line to posted actuals', async () => {
    budgetRepo.findOne.mockResolvedValue({
      id: 'b1', tenantId: 't1', totalBudget: 1000,
      lines: [{ accountCode: '6000', period: '2026-07', budgetAmount: 1000 }],
    });
    dataSource.query.mockResolvedValue([{ actual: '750' }]);
    const v = await service.getBudgetVariance('t1', 'b1');
    expect(v.lines[0]).toMatchObject({ actual: 750, variance: 250 });
    expect(v.variance).toBe(250);
  });

  it('evaluateKpi applies the ±5% target band', async () => {
    kpiRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', sqlQuery: 'q', targetValue: 100 });
    dataSource.query.mockResolvedValue([{ value: '103' }]);
    expect((await service.evaluateKpi('t1', 'k1')).status).toBe('ON_TARGET'); // within 5%

    dataSource.query.mockResolvedValue([{ value: '120' }]);
    expect((await service.evaluateKpi('t1', 'k1')).status).toBe('ABOVE');

    dataSource.query.mockResolvedValue([{ value: '80' }]);
    expect((await service.evaluateKpi('t1', 'k1')).status).toBe('BELOW');
  });

  it('evaluateKpi treats a failing query as 0, and lookups 404 tenant-scoped', async () => {
    kpiRepo.findOne.mockResolvedValue({ id: 'k1', tenantId: 't1', sqlQuery: 'bad', targetValue: null });
    dataSource.query.mockRejectedValue(new Error('boom'));
    expect((await service.evaluateKpi('t1', 'k1')).value).toBe(0);

    kpiRepo.findOne.mockResolvedValue(null);
    await expect(service.evaluateKpi('t2', 'ghost')).rejects.toThrow(NotFoundException);
  });
});
