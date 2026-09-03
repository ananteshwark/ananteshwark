import { BadRequestException } from '@nestjs/common';
import { SemanticService } from './semantic.service';

const mockRepo = () => ({
  query: jest.fn().mockResolvedValue([]),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn((x: any) => Promise.resolve({ id: 'sq-1', ...x })),
  create: jest.fn((x: any) => x),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('SemanticService — query planning', () => {
  let service: SemanticService;
  let repo: any;

  beforeEach(() => {
    repo = mockRepo();
    service = new SemanticService(repo);
  });

  it('compiles dimensions + measures + filters into parameterized SQL', () => {
    const plan = service.buildPlan('t1', {
      dataset: 'expenses',
      dimensions: ['status'],
      measures: ['count', 'totalAmount'],
      filters: [{ dimension: 'currency', value: 'INR' }],
      from: '2026-01-01',
      to: '2026-06-30',
    });
    expect(plan.sql).toContain('FROM exp_claims');
    expect(plan.sql).toContain('status AS "status"');
    expect(plan.sql).toContain('COUNT(*) AS "count"');
    expect(plan.sql).toContain('COALESCE(SUM(total_amount), 0) AS "totalAmount"');
    expect(plan.sql).toContain('tenant_id = $1');
    expect(plan.sql).toContain('currency = $2');
    expect(plan.sql).toContain('claim_date >= $3');
    expect(plan.sql).toContain('claim_date <= $4');
    expect(plan.sql).toContain('GROUP BY status');
    expect(plan.params).toEqual(['t1', 'INR', '2026-01-01', '2026-06-30']);
  });

  it('supports a month time grain on the dataset date column', () => {
    const plan = service.buildPlan('t1', {
      dataset: 'sales_orders', dimensions: ['month'], measures: ['total'],
    });
    expect(plan.sql).toContain(`DATE_TRUNC('month', order_date::date)`);
    expect(plan.sql).toContain('AS "month"');
  });

  it('rejects unknown datasets, dimensions, measures, and dateless grains', () => {
    expect(() => service.buildPlan('t1', { dataset: 'nope', measures: ['count'] }))
      .toThrow('Unknown dataset');
    expect(() => service.buildPlan('t1', { dataset: 'expenses', dimensions: ['secret_column'], measures: ['count'] }))
      .toThrow('Unknown dimension');
    expect(() => service.buildPlan('t1', { dataset: 'expenses', measures: ['drop_table'] }))
      .toThrow('Unknown measure');
    expect(() => service.buildPlan('t1', { dataset: 'tickets', dimensions: ['month'], measures: ['count'] }))
      .toThrow('no date column');
    expect(() => service.buildPlan('t1', { dataset: 'expenses', measures: [] }))
      .toThrow(BadRequestException);
  });

  it('malicious values ride as parameters, never as SQL', () => {
    const plan = service.buildPlan('t1', {
      dataset: 'expenses',
      measures: ['count'],
      filters: [{ dimension: 'status', value: `'; DROP TABLE users; --` }],
    });
    expect(plan.sql).not.toContain('DROP TABLE');
    expect(plan.params[1]).toContain('DROP TABLE'); // safely bound
  });

  it('clamps limit into [1, 5000]', () => {
    expect(service.buildPlan('t1', { dataset: 'tickets', measures: ['count'], limit: 999999 }).sql)
      .toContain('LIMIT 5000');
    expect(service.buildPlan('t1', { dataset: 'tickets', measures: ['count'] }).sql)
      .toContain('LIMIT 500');
  });

  it('run executes the plan; saveQuery validates the definition first', async () => {
    repo.query.mockResolvedValue([{ status: 'SUBMITTED', count: '3' }]);
    const { rows } = await service.run('t1', { dataset: 'expenses', dimensions: ['status'], measures: ['count'] });
    expect(rows).toHaveLength(1);
    expect(repo.query).toHaveBeenCalledWith(expect.stringContaining('FROM exp_claims'), expect.any(Array));

    await expect(service.saveQuery('t1', 'u1', {
      name: 'Bad', definition: { dataset: 'nope', measures: ['count'] },
    })).rejects.toThrow('Unknown dataset');

    const saved = await service.saveQuery('t1', 'u1', {
      name: 'Spend by month', chartType: 'line',
      definition: { dataset: 'expenses', dimensions: ['month'], measures: ['totalAmount'] },
    });
    expect(saved.name).toBe('Spend by month');
  });

  it('listDatasets exposes keys and labels but not SQL internals', () => {
    const datasets = service.listDatasets();
    const expenses = datasets.find((d) => d.key === 'expenses')!;
    expect(expenses.measures.map((m) => m.key)).toContain('totalAmount');
    expect(JSON.stringify(datasets)).not.toContain('SUM(');
  });
});
