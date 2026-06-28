import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayrollCostingService } from './payroll-costing.service';
import { PayrollCostingRule, SplitType } from './entities/payroll-costing-rule.entity';
import { PayrollCostDistribution } from './entities/payroll-cost-distribution.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
  remove: jest.fn(),
  delete: jest.fn(),
});

describe('PayrollCostingService — Phase 174-176', () => {
  let service: PayrollCostingService;
  let ruleRepo: any;
  let distRepo: any;

  beforeEach(async () => {
    ruleRepo = mockRepo();
    distRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        PayrollCostingService,
        { provide: getRepositoryToken(PayrollCostingRule), useValue: ruleRepo },
        { provide: getRepositoryToken(PayrollCostDistribution), useValue: distRepo },
      ],
    }).compile();
    service = module.get(PayrollCostingService);
  });

  // ─── Ph-174 ───────────────────────────────────────────────────────

  it('createRule — requires name + non-negative split', async () => {
    await expect(service.createRule('t1', { name: '', splitValue: 10 })).rejects.toThrow(BadRequestException);
    await expect(service.createRule('t1', { name: 'X', splitValue: -1 })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-175: split logic ──────────────────────────────────────────

  it('splitElementCost — percentage rules split, remainder to default', () => {
    const rules = [
      { costCenterId: 'cc1', projectId: null, glAccountId: null, splitType: SplitType.PERCENTAGE, splitValue: 60, name: 'R1' },
      { costCenterId: 'cc2', projectId: null, glAccountId: null, splitType: SplitType.PERCENTAGE, splitValue: 30, name: 'R2' },
    ] as PayrollCostingRule[];
    const splits = service.splitElementCost(1000, rules);
    expect(splits).toHaveLength(3);
    expect(splits[0]).toMatchObject({ costCenterId: 'cc1', amount: 600 });
    expect(splits[1]).toMatchObject({ costCenterId: 'cc2', amount: 300 });
    expect(splits[2]).toMatchObject({ costCenterId: null, amount: 100 }); // remainder
  });

  it('splitElementCost — absolute rule consumes fixed amount', () => {
    const rules = [
      { costCenterId: 'cc1', splitType: SplitType.ABSOLUTE, splitValue: 250, name: 'Fixed' },
    ] as PayrollCostingRule[];
    const splits = service.splitElementCost(1000, rules);
    expect(splits[0]).toMatchObject({ costCenterId: 'cc1', amount: 250 });
    expect(splits[1]).toMatchObject({ amount: 750 }); // remainder
  });

  it('splitElementCost — fully allocated leaves no remainder', () => {
    const rules = [{ costCenterId: 'cc1', splitType: SplitType.PERCENTAGE, splitValue: 100, name: 'All' }] as PayrollCostingRule[];
    const splits = service.splitElementCost(500, rules);
    expect(splits).toHaveLength(1);
    expect(splits[0].amount).toBe(500);
  });

  it('splitElementCost — caps split at remaining amount', () => {
    const rules = [{ costCenterId: 'cc1', splitType: SplitType.ABSOLUTE, splitValue: 5000, name: 'Big' }] as PayrollCostingRule[];
    const splits = service.splitElementCost(1000, rules);
    expect(splits).toHaveLength(1);
    expect(splits[0].amount).toBe(1000);
  });

  it('distribute — clears prior, applies matching rules per line', async () => {
    ruleRepo.find.mockResolvedValue([
      { componentCode: 'BASIC', costCenterId: 'cc1', splitType: SplitType.PERCENTAGE, splitValue: 100, name: 'Basic→CC1' },
      { componentCode: null, costCenterId: 'cc9', splitType: SplitType.PERCENTAGE, splitValue: 100, name: 'All→CC9' },
    ]);
    distRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.distribute('t1', 'run1', [
      { employeeId: 'e1', componentCode: 'BASIC', amount: 1000 },
      { employeeId: 'e1', componentCode: 'HRA', amount: 400 },
    ]);
    expect(distRepo.delete).toHaveBeenCalledWith({ tenantId: 't1', payrollRunId: 'run1' });
    // BASIC matches both rules (BASIC + null); HRA matches the null rule only
    expect(r.total).toBe(1400);
    expect(r.created).toBeGreaterThanOrEqual(2);
  });

  it('distribute — rejects empty lines', async () => {
    await expect(service.distribute('t1', 'run1', [])).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-176: labor report ─────────────────────────────────────────

  it('laborReport — aggregates by cost center with pct', async () => {
    distRepo.find.mockResolvedValue([
      { costCenterId: 'cc1', amount: 600 },
      { costCenterId: 'cc1', amount: 200 },
      { costCenterId: 'cc2', amount: 200 },
    ]);
    const rep = await service.laborReport('t1', { groupBy: 'costCenter' });
    expect(rep.total).toBe(1000);
    expect(rep.lines[0]).toMatchObject({ key: 'cc1', amount: 800, pct: 80 });
    expect(rep.lines[1]).toMatchObject({ key: 'cc2', amount: 200, pct: 20 });
  });

  it('laborReport — groups by component', async () => {
    distRepo.find.mockResolvedValue([
      { componentCode: 'BASIC', amount: 500 },
      { componentCode: 'HRA', amount: 250 },
    ]);
    const rep = await service.laborReport('t1', { groupBy: 'component' });
    expect(rep.lines.find((l: any) => l.key === 'BASIC').amount).toBe(500);
  });
});
