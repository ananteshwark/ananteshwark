import { SyncService } from './sync.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x: any) => x),
  save: jest.fn((x: any) => Promise.resolve({ id: 'row-1', ...x })),
});

const build = (over: Partial<Record<string, any>> = {}) => {
  const repos = {
    mutationRepo: mockRepo(), employeeRepo: mockRepo(), claimRepo: mockRepo(),
    leaveRepo: mockRepo(), travelRepo: mockRepo(), caseRepo: mockRepo(), checkinRepo: mockRepo(),
    mobile: {
      checkIn: jest.fn().mockResolvedValue({ id: 'chk-1' }),
      checkOut: jest.fn().mockResolvedValue({ id: 'chk-1', hours: 8 }),
    },
    helpdesk: { createCase: jest.fn().mockResolvedValue({ id: 'c1', caseNumber: 'HRC-000004' }) },
    ...over,
  };
  const service = new SyncService(
    repos.mutationRepo as any, repos.employeeRepo as any, repos.claimRepo as any,
    repos.leaveRepo as any, repos.travelRepo as any, repos.caseRepo as any,
    repos.checkinRepo as any, repos.mobile as any, repos.helpdesk as any,
  );
  return { service, ...repos };
};

describe('SyncService — delta pull', () => {
  it('scopes every dataset to my employee record and advances the cursor', async () => {
    const { service, employeeRepo, claimRepo } = build();
    employeeRepo.findOne.mockResolvedValue({ id: 'emp-9', userId: 'u1' });
    claimRepo.find.mockResolvedValue([
      { id: 'x1', updatedAt: new Date('2026-07-01T10:00:00Z') },
      { id: 'x2', updatedAt: new Date('2026-07-03T09:30:00Z') },
    ]);
    const result = await service.pull('t1', 'u1', { cursor: '2026-06-30T00:00:00Z', datasets: ['expenses'] });
    expect(claimRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 't1', employeeId: 'emp-9' }),
    }));
    expect(result.datasets.expenses.rows).toHaveLength(2);
    expect(result.cursor).toBe('2026-07-03T09:30:00.000Z');
    expect(result.hasMore).toBe(false);
  });

  it('signals hasMore when a dataset page overflows and keeps other datasets independent', async () => {
    const { service, employeeRepo, claimRepo, leaveRepo } = build();
    employeeRepo.findOne.mockResolvedValue({ id: 'emp-9' });
    claimRepo.find.mockResolvedValue(
      Array.from({ length: 201 }, (_, i) => ({ id: `x${i}`, updatedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, i)) })),
    );
    leaveRepo.find.mockResolvedValue([]);
    const result = await service.pull('t1', 'u1', { datasets: ['expenses', 'leaves'] });
    expect(result.datasets.expenses.rows).toHaveLength(200);
    expect(result.datasets.expenses.hasMore).toBe(true);
    expect(result.datasets.leaves.hasMore).toBe(false);
    expect(result.hasMore).toBe(true);
  });

  it('returns empty datasets when the user has no employee record; rejects bad cursors', async () => {
    const { service } = build();
    const result = await service.pull('t1', 'u1', { datasets: ['expenses'] });
    expect(result.datasets.expenses.rows).toEqual([]);
    await expect(service.pull('t1', 'u1', { cursor: 'not-a-date' })).rejects.toThrow('ISO timestamp');
  });
});

describe('SyncService — mutation push', () => {
  it('applies typed mutations through real services and logs the outcome', async () => {
    const { service, employeeRepo, mutationRepo, mobile, helpdesk } = build();
    employeeRepo.findOne.mockResolvedValue({ id: 'emp-9' });
    const { results } = await service.push('t1', 'u1', 'device-A', [
      { clientMutationId: 'm1', type: 'checkin.create', payload: { date: '2026-07-08', at: '2026-07-08T09:00:00Z' } },
      { clientMutationId: 'm2', type: 'hr_case.create', payload: { subject: 'Payslip missing' } },
    ]);
    expect(mobile.checkIn).toHaveBeenCalledWith('t1', expect.objectContaining({ employeeId: 'emp-9', date: '2026-07-08' }));
    expect(helpdesk.createCase).toHaveBeenCalledWith('t1', 'u1', expect.objectContaining({ subject: 'Payslip missing' }));
    expect(results).toEqual([
      { clientMutationId: 'm1', status: 'APPLIED', result: { id: 'chk-1' }, error: undefined },
      { clientMutationId: 'm2', status: 'APPLIED', result: { id: 'c1', caseNumber: 'HRC-000004' }, error: undefined },
    ]);
    expect(mutationRepo.save).toHaveBeenCalledTimes(2);
  });

  it('replays an already-applied mutation from the log without re-executing', async () => {
    const { service, mutationRepo, mobile } = build();
    mutationRepo.findOne.mockResolvedValue({
      status: 'APPLIED', result: { id: 'chk-1' }, error: null,
    });
    const { results } = await service.push('t1', 'u1', 'device-A', [
      { clientMutationId: 'm1', type: 'checkin.create', payload: {} },
    ]);
    expect(results[0]).toMatchObject({ status: 'APPLIED', result: { id: 'chk-1' }, replayed: true });
    expect(mobile.checkIn).not.toHaveBeenCalled();
    expect(mutationRepo.save).not.toHaveBeenCalled();
  });

  it('records handler failures as FAILED and rejects unknown types without logging them', async () => {
    const { service, employeeRepo, mutationRepo, mobile } = build();
    employeeRepo.findOne.mockResolvedValue({ id: 'emp-9' });
    mobile.checkIn.mockRejectedValue(new Error('Already checked in'));
    const { results } = await service.push('t1', 'u1', 'device-A', [
      { clientMutationId: 'm1', type: 'checkin.create', payload: { date: '2026-07-08' } },
      { clientMutationId: 'm2', type: 'not.a.thing', payload: {} },
      { clientMutationId: '', type: 'checkin.create', payload: {} },
    ]);
    expect(results[0]).toMatchObject({ status: 'FAILED', error: 'Already checked in' });
    expect(results[1]).toMatchObject({ status: 'REJECTED', error: expect.stringContaining('Unknown mutation type') });
    expect(results[2].status).toBe('REJECTED');
    expect(mutationRepo.save).toHaveBeenCalledTimes(1); // only the FAILED one is journaled
  });

  it('coverage reports datasets and registered mutation types', () => {
    const { service } = build();
    const cov = service.coverage();
    expect(cov.datasets.map((d: any) => d.key)).toEqual(['expenses', 'leaves', 'travel', 'hr_cases', 'checkins']);
    expect(cov.mutations).toEqual(['checkin.checkout', 'checkin.create', 'hr_case.create']);
  });

  it('degrades: no handlers registered when mobile/helpdesk are absent', () => {
    const { service } = build({ mobile: undefined, helpdesk: undefined });
    expect(service.coverage().mutations).toEqual([]);
  });
});
