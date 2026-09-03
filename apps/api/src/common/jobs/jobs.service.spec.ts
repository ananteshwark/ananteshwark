import { JobsService } from './jobs.service';
import { JobStatus } from './job-record.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'job-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  update: jest.fn().mockResolvedValue({}),
  find: jest.fn().mockResolvedValue([]),
  query: jest.fn().mockResolvedValue([]),
});

describe('JobsService — durable one-shot queue', () => {
  let repo: any;
  let service: JobsService;

  beforeEach(() => {
    repo = mockRepo();
    service = new JobsService(repo);
  });

  it('enqueue persists PENDING work with sane defaults', async () => {
    const job = await service.enqueue('send-welcome-email', { userId: 'u1' }, { tenantId: 't1' });
    expect(job).toMatchObject({
      type: 'send-welcome-email',
      tenantId: 't1',
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
    });
    expect(job.runAt).toBeInstanceOf(Date);
  });

  it('claims atomically with FOR UPDATE SKIP LOCKED and increments attempts in the same statement', async () => {
    await service.claimNext();
    const [sql, params] = repo.query.mock.calls[0];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain("status = 'RUNNING'");
    expect(sql).toContain('attempts = attempts + 1');
    expect(sql).toContain('run_at <= NOW()');
    expect(params).toHaveLength(1); // worker id
  });

  it('a successful handler completes the job', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    service.registerHandler('ok-job', handler);
    repo.query.mockResolvedValue([{ id: 'j1', type: 'ok-job', payload: { a: 1 }, attempts: 1, maxAttempts: 3 }]);
    expect(await service.processNext()).toBe('completed');
    expect(handler).toHaveBeenCalledWith({ a: 1 }, expect.objectContaining({ id: 'j1' }));
    expect(repo.update).toHaveBeenCalledWith({ id: 'j1' }, expect.objectContaining({ status: JobStatus.COMPLETED }));
  });

  it('a failing handler retries with exponential backoff', async () => {
    service.registerHandler('flaky', jest.fn().mockRejectedValue(new Error('boom')));
    repo.query.mockResolvedValue([{ id: 'j1', type: 'flaky', payload: {}, attempts: 2, maxAttempts: 3 }]);
    const before = Date.now();
    expect(await service.processNext()).toBe('retried');
    const update = repo.update.mock.calls[0][1];
    expect(update.status).toBe(JobStatus.PENDING);
    expect(update.lastError).toBe('boom');
    // attempt 2 → backoff 30s * 2^1 = 60s
    const delay = update.runAt.getTime() - before;
    expect(delay).toBeGreaterThan(55_000);
    expect(delay).toBeLessThan(65_000);
  });

  it('exhausted retries park the job as DEAD; unknown types fail the same path', async () => {
    service.registerHandler('flaky', jest.fn().mockRejectedValue(new Error('still broken')));
    repo.query.mockResolvedValue([{ id: 'j1', type: 'flaky', payload: {}, attempts: 3, maxAttempts: 3 }]);
    expect(await service.processNext()).toBe('dead');
    expect(repo.update).toHaveBeenCalledWith({ id: 'j1' }, expect.objectContaining({ status: JobStatus.DEAD }));

    repo.query.mockResolvedValue([{ id: 'j2', type: 'nobody-handles-this', payload: {}, attempts: 3, maxAttempts: 3 }]);
    expect(await service.processNext()).toBe('dead');
  });

  it('tick drains due jobs but only while holding the leader lease', async () => {
    const leases: any = { tryAcquire: jest.fn().mockResolvedValue(false) };
    const gated = new JobsService(repo, leases);
    expect(await gated.tick()).toBe(0);
    expect(repo.query).not.toHaveBeenCalled();

    leases.tryAcquire.mockResolvedValue(true);
    gated.registerHandler('ok', jest.fn().mockResolvedValue(undefined));
    repo.query
      .mockResolvedValueOnce([{ id: 'j1', type: 'ok', payload: {}, attempts: 1, maxAttempts: 3 }])
      .mockResolvedValueOnce([]); // then idle
    expect(await gated.tick()).toBe(1);
  });

  it('retryDead requeues a parked job from scratch', async () => {
    await service.retryDead('j9');
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'j9', status: JobStatus.DEAD },
      expect.objectContaining({ status: JobStatus.PENDING, attempts: 0 }),
    );
  });
});
