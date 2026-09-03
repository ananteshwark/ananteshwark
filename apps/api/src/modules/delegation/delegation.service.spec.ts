import { NotFoundException } from '@nestjs/common';
import { DelegationService } from './delegation.service';

/**
 * Approval delegation: creation defaults, tenant-scoped lookups, revoke,
 * and resolveDelegate (date/scope matching, one chained hop, loop guard).
 */
describe('DelegationService', () => {
  let service: DelegationService;
  let repo: any;

  beforeEach(() => {
    repo = {
      create: jest.fn((x) => ({ id: 'gen-1', ...x })),
      save: jest.fn((x) => Promise.resolve(x)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    service = new DelegationService(repo);
  });

  const delegation = (over: any = {}) => ({
    id: 'd1', tenantId: 't1', delegatorUserId: 'mgr', delegateeUserId: 'peer',
    scope: 'ALL', isActive: true, fromDate: '2026-01-01', toDate: '2026-12-31', ...over,
  });

  it('create defaults the delegator to the current user and starts active', async () => {
    const d = await service.create('t1', 'me', { delegateeUserId: 'peer', fromDate: '2026-07-01', toDate: '2026-07-31' } as any);
    expect(d.delegatorUserId).toBe('me');
    expect(d.scope).toBe('ALL');
    expect(d.isActive).toBe(true);
  });

  it('findById is tenant-scoped and 404s when missing', async () => {
    await expect(service.findById('d1', 't2')).rejects.toThrow(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'd1', tenantId: 't2' } });
  });

  it('revoke deactivates the delegation', async () => {
    repo.findOne.mockResolvedValue(delegation());
    const d = await service.revoke('d1', 't1');
    expect(d.isActive).toBe(false);
  });

  it('resolveDelegate returns the approver themselves when nothing covers the date', async () => {
    repo.find.mockResolvedValue([]);
    expect(await service.resolveDelegate('t1', 'mgr')).toBe('mgr');
  });

  it('resolveDelegate returns the delegatee for a covering delegation', async () => {
    repo.find.mockImplementation(({ where }: any) =>
      Promise.resolve(where.delegatorUserId === 'mgr' ? [delegation()] : []));
    expect(await service.resolveDelegate('t1', 'mgr')).toBe('peer');
  });

  it('resolveDelegate follows exactly one chained hop', async () => {
    repo.find.mockImplementation(({ where }: any) => {
      if (where.delegatorUserId === 'mgr') return Promise.resolve([delegation({ delegateeUserId: 'peer' })]);
      if (where.delegatorUserId === 'peer') return Promise.resolve([delegation({ delegatorUserId: 'peer', delegateeUserId: 'third' })]);
      if (where.delegatorUserId === 'third') return Promise.resolve([delegation({ delegatorUserId: 'third', delegateeUserId: 'fourth' })]);
      return Promise.resolve([]);
    });
    // mgr -> peer -> third, then stops (max two hops)
    expect(await service.resolveDelegate('t1', 'mgr')).toBe('third');
  });

  it('resolveDelegate breaks delegation loops', async () => {
    repo.find.mockImplementation(({ where }: any) => {
      if (where.delegatorUserId === 'mgr') return Promise.resolve([delegation({ delegateeUserId: 'peer' })]);
      if (where.delegatorUserId === 'peer') return Promise.resolve([delegation({ delegatorUserId: 'peer', delegateeUserId: 'mgr' })]);
      return Promise.resolve([]);
    });
    // peer delegates back to mgr — loop guard stops at peer
    expect(await service.resolveDelegate('t1', 'mgr')).toBe('peer');
  });

  it('resolveDelegate prefers a scope match but accepts ALL as fallback', async () => {
    repo.find.mockResolvedValue([delegation({ scope: 'EXPENSES', delegateeUserId: 'exp-guy' })]);
    expect(await service.resolveDelegate('t1', 'mgr', 'EXPENSES')).toBe('exp-guy');
    // a LEAVE-scoped request does not match the EXPENSES delegation
    expect(await service.resolveDelegate('t1', 'mgr', 'LEAVE')).toBe('mgr');
  });

  it('getActiveForUser splits outbound and inbound delegations', async () => {
    repo.find
      .mockResolvedValueOnce([delegation()]) // outbound
      .mockResolvedValueOnce([]); // inbound
    const r = await service.getActiveForUser('t1', 'mgr');
    expect(r.outbound).toHaveLength(1);
    expect(r.inbound).toHaveLength(0);
  });
});
