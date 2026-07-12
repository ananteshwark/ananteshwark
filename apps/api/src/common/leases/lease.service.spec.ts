import { LeaseService } from './lease.service';

describe('LeaseService — leader election', () => {
  let repo: any;
  let service: LeaseService;

  beforeEach(() => {
    repo = { query: jest.fn(), delete: jest.fn().mockResolvedValue({}) };
    service = new LeaseService(repo);
  });

  it('wins when the atomic upsert returns this holder', async () => {
    repo.query.mockResolvedValue([{ holder_id: 'me' }]);
    expect(await service.tryAcquire('automation-sweeps', 'me', 60_000)).toBe(true);
    const [sql, params] = repo.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (name) DO UPDATE');
    expect(sql).toContain('expires_at < NOW()'); // steal only expired leases
    expect(params[0]).toBe('automation-sweeps');
    expect(params[1]).toBe('me');
  });

  it('loses when another instance holds an unexpired lease (no row returned)', async () => {
    repo.query.mockResolvedValue([]); // conditional update did not fire
    expect(await service.tryAcquire('automation-sweeps', 'me', 60_000)).toBe(false);
  });

  it('fails closed when the lease store errors — skip the tick, never crash', async () => {
    repo.query.mockRejectedValue(new Error('connection refused'));
    expect(await service.tryAcquire('automation-sweeps', 'me', 60_000)).toBe(false);
  });

  it('release only deletes own lease', async () => {
    await service.release('automation-sweeps', 'me');
    expect(repo.delete).toHaveBeenCalledWith({ name: 'automation-sweeps', holderId: 'me' });
  });
});

describe('AutomationSchedulerService — lease-gated ticks', () => {
  const { AutomationSchedulerService } = require('../../modules/automation/automation-scheduler.service');

  const mockRepo = () => ({ find: jest.fn().mockResolvedValue([]), save: jest.fn() });

  it('skips the sweep when it is not the leader, sweeps when it is', async () => {
    const automation = { emit: jest.fn() };
    const leases = { tryAcquire: jest.fn().mockResolvedValue(false) };
    const service = new AutomationSchedulerService(
      automation, mockRepo(), mockRepo(), mockRepo(), leases,
    );
    expect(await service.sweepIfLeader()).toBeNull();
    expect(leases.tryAcquire).toHaveBeenCalledWith('automation-sweeps', expect.any(String), 90 * 60_000);

    leases.tryAcquire.mockResolvedValue(true);
    const result = await service.sweepIfLeader();
    expect(result).toMatchObject({ overdueInvoices: 0, slaBreaches: 0, expiringContracts: 0 });
  });

  it('sweeps unconditionally when no lease service is wired (single instance)', async () => {
    const service = new AutomationSchedulerService(
      { emit: jest.fn() }, mockRepo(), mockRepo(), mockRepo(),
    );
    expect(await service.sweepIfLeader()).toMatchObject({ overdueInvoices: 0, slaBreaches: 0, expiringContracts: 0 });
  });
});
