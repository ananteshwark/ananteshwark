import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConsolidationService } from './consolidation.service';
import { ConsolidationRunStatus } from './entities/consolidation-run.entity';
import { AccountType } from '../gl/entities/account.entity';

/**
 * Consolidation: group code uniqueness + guards (inactive / empty member
 * list), the P&L and balance-sheet rollup from posted journals with IC
 * eliminations, and failure capture on the run record.
 */
describe('ConsolidationService', () => {
  let service: ConsolidationService;
  let groupRepo: any, runRepo: any, journalRepo: any, lineRepo: any, accountRepo: any, intercompanyService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(),
  });

  const group = (over: any = {}) => ({
    id: 'g1', tenantId: 't1', name: 'Group', isActive: true, memberEntityIds: ['le1', 'le2'], ...over,
  });

  beforeEach(() => {
    groupRepo = mockRepo(); runRepo = mockRepo(); journalRepo = mockRepo();
    lineRepo = mockRepo(); accountRepo = mockRepo();
    intercompanyService = {
      getReconciliation: jest.fn().mockResolvedValue({
        summary: { totalIcAr: -150, totalIcAp: 150, netDifference: 0, imbalancedPairs: 0 },
      }),
    };
    service = new ConsolidationService(groupRepo, runRepo, journalRepo, lineRepo, accountRepo, intercompanyService);
  });

  it('createGroup enforces unique code per tenant', async () => {
    groupRepo.findOne.mockResolvedValue({ id: 'existing' });
    await expect(service.createGroup('t1', { code: 'GRP', name: 'X', memberEntityIds: [] } as any)).rejects.toThrow('already exists');
  });

  it('runConsolidation rejects inactive groups and empty member lists', async () => {
    groupRepo.findOne.mockResolvedValue(group({ isActive: false }));
    await expect(service.runConsolidation('t1', { groupId: 'g1', periodStart: 'a', periodEnd: 'b' } as any, 'u1')).rejects.toThrow('inactive');

    groupRepo.findOne.mockResolvedValue(group({ memberEntityIds: [] }));
    await expect(service.runConsolidation('t1', { groupId: 'g1', periodStart: 'a', periodEnd: 'b' } as any, 'u1')).rejects.toThrow('no member');
  });

  it('an empty period completes with zeroed totals', async () => {
    groupRepo.findOne.mockResolvedValue(group());
    journalRepo.find.mockResolvedValue([]);
    const run = await service.runConsolidation('t1', { groupId: 'g1', periodStart: '2026-01-01', periodEnd: '2026-03-31' } as any, 'u1');
    expect(run.status).toBe(ConsolidationRunStatus.COMPLETED);
    expect(run.netIncome).toBe(0);
    expect(run.totalAssets).toBe(0);
  });

  it('rolls up P&L and balance sheet by account type with IC eliminations', async () => {
    groupRepo.findOne.mockResolvedValue(group());
    journalRepo.find.mockResolvedValue([{ id: 'je1' }]);
    lineRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { accountId: 'rev', debit: 0, credit: 1000 },
        { accountId: 'exp', debit: 400, credit: 0 },
        { accountId: 'cash', debit: 600, credit: 0 },
        { accountId: 'ap', debit: 0, credit: 600 },
      ]),
    });
    accountRepo.find.mockResolvedValue([
      { id: 'rev', type: AccountType.INCOME, name: 'Revenue', code: '4000' },
      { id: 'exp', type: AccountType.EXPENSE, name: 'COGS', code: '5000' },
      { id: 'cash', type: AccountType.ASSET, name: 'Cash', code: '1000' },
      { id: 'ap', type: AccountType.LIABILITY, name: 'AP', code: '2000' },
    ]);
    const run = await service.runConsolidation('t1', { groupId: 'g1', periodStart: '2026-01-01', periodEnd: '2026-03-31' } as any, 'u1');
    expect(run.status).toBe(ConsolidationRunStatus.COMPLETED);
    expect(run.totalRevenue).toBe(1000);
    expect(run.totalExpenses).toBe(400);
    expect(run.netIncome).toBe(600);
    expect(run.totalAssets).toBe(600);
    expect(run.totalLiabilities).toBe(600);
    expect(run.icEliminations).toBe(150); // |totalIcAr|
  });

  it('a compute failure marks the run FAILED with the error message', async () => {
    groupRepo.findOne.mockResolvedValue(group());
    journalRepo.find.mockRejectedValue(new Error('db exploded'));
    const run = await service.runConsolidation('t1', { groupId: 'g1', periodStart: 'a', periodEnd: 'b' } as any, 'u1');
    expect(run.status).toBe(ConsolidationRunStatus.FAILED);
    expect(run.errorMessage).toBe('db exploded');
  });

  it('lookups are tenant-scoped 404s', async () => {
    await expect(service.getGroup('t2', 'x')).rejects.toThrow(NotFoundException);
    expect(groupRepo.findOne).toHaveBeenCalledWith({ where: { id: 'x', tenantId: 't2' } });
  });
});
