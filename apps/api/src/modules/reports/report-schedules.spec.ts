import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportCadence } from './entities/report-schedule.entity';

/**
 * Scheduled report delivery: cadence math in UTC, creator-permission runs,
 * CSV email fan-out, and failure isolation with nextRunAt always rolling
 * forward so a broken schedule never retries hot.
 */
const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 's1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue(undefined),
});

const build = () => {
  const reports: any = {
    describe: jest.fn().mockResolvedValue({ columns: [] }),
    validateFilters: jest.fn(),
    exportCsv: jest.fn().mockResolvedValue({ filename: 'r.csv', csv: 'a,b\n1,2' }),
  };
  const scheduleRepo = mockRepo();
  const viewRepo = mockRepo();
  const email: any = { sendRaw: jest.fn().mockResolvedValue({ status: 'SENT' }) };
  const service = new ReportSchedulesService(reports, scheduleRepo as any, viewRepo as any, email);
  return { service, reports, scheduleRepo, viewRepo, email };
};

describe('nextRun (UTC cadence math)', () => {
  const at = (iso: string) => new Date(iso);

  it('DAILY: today at hourUtc if still ahead, else tomorrow', () => {
    expect(ReportSchedulesService.nextRun({ cadence: ReportCadence.DAILY, hourUtc: 6 }, at('2026-07-14T04:00:00Z')).toISOString())
      .toBe('2026-07-14T06:00:00.000Z');
    expect(ReportSchedulesService.nextRun({ cadence: ReportCadence.DAILY, hourUtc: 6 }, at('2026-07-14T06:00:00Z')).toISOString())
      .toBe('2026-07-15T06:00:00.000Z'); // strictly after
  });

  it('WEEKLY: next matching weekday at hourUtc', () => {
    // 2026-07-14 is a Tuesday; Monday=1 → next Monday is 2026-07-20.
    expect(ReportSchedulesService.nextRun({ cadence: ReportCadence.WEEKLY, dayOfWeek: 1, hourUtc: 8 }, at('2026-07-14T10:00:00Z')).toISOString())
      .toBe('2026-07-20T08:00:00.000Z');
  });

  it('MONTHLY: clamps the day to short months', () => {
    // Requested day 31, run from mid-January → Jan 31; from Feb 1 → Feb 28.
    expect(ReportSchedulesService.nextRun({ cadence: ReportCadence.MONTHLY, dayOfMonth: 31, hourUtc: 5 }, at('2026-01-15T00:00:00Z')).toISOString())
      .toBe('2026-01-31T05:00:00.000Z');
    expect(ReportSchedulesService.nextRun({ cadence: ReportCadence.MONTHLY, dayOfMonth: 31, hourUtc: 5 }, at('2026-02-01T00:00:00Z')).toISOString())
      .toBe('2026-02-28T05:00:00.000Z');
  });
});

describe('create', () => {
  const now = new Date('2026-07-14T10:00:00Z');

  it('validates report, recipients, cadence params and filters, then computes nextRunAt', async () => {
    const { service, reports } = build();
    const saved = await service.create('u1', 't1', {
      reportCode: 'hr-employees', name: 'Weekly actives',
      recipients: ['hr@acme.com'], cadence: ReportCadence.WEEKLY, dayOfWeek: 1, hourUtc: 8,
      filters: [{ field: 'status', op: 'eq', value: 'ACTIVE' }],
    }, now);
    expect(reports.describe).toHaveBeenCalledWith('u1', 't1', 'hr-employees'); // permission gate
    expect(reports.validateFilters).toHaveBeenCalled();
    expect(saved.nextRunAt.toISOString()).toBe('2026-07-20T08:00:00.000Z');
    expect(saved.createdByUserId).toBe('u1');
  });

  it('rejects unknown reports, bad emails and out-of-range cadence params', async () => {
    const { service } = build();
    await expect(service.create('u1', 't1', { reportCode: 'nope', name: 'x', recipients: ['a@b.co'] }, now)).rejects.toThrow(NotFoundException);
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: ['not-an-email'] }, now)).rejects.toThrow(BadRequestException);
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: [] }, now)).rejects.toThrow(BadRequestException);
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: ['a@b.co'], hourUtc: 25 }, now)).rejects.toThrow(BadRequestException);
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: ['a@b.co'], dayOfWeek: 9 }, now)).rejects.toThrow(BadRequestException);
  });

  it('a pinned view must exist and belong to the same report', async () => {
    const { service, viewRepo } = build();
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: ['a@b.co'], viewId: 'v1' }, now)).rejects.toThrow(NotFoundException);
    viewRepo.findOne.mockResolvedValue({ id: 'v1', reportCode: 'finance-ar-invoices' });
    await expect(service.create('u1', 't1', { reportCode: 'hr-employees', name: 'x', recipients: ['a@b.co'], viewId: 'v1' }, now)).rejects.toThrow(BadRequestException);
  });
});

describe('runDueSchedules', () => {
  const asOf = new Date('2026-07-14T06:00:00Z');
  const dueSchedule = (over: any = {}) => ({
    id: 's1', tenantId: 't1', reportCode: 'hr-employees', name: 'Weekly actives',
    recipients: ['hr@acme.com', 'ceo@acme.com'], cadence: ReportCadence.DAILY, hourUtc: 6,
    viewId: null, filters: [{ field: 'status', op: 'eq', value: 'ACTIVE' }],
    sortBy: null, sortDir: 'DESC', active: true, createdByUserId: 'creator-1', ...over,
  });

  it('runs the report as the creator and emails the CSV to every recipient', async () => {
    const { service, reports, scheduleRepo, email } = build();
    scheduleRepo.find.mockResolvedValue([dueSchedule()]);
    const results = await service.runDueSchedules(asOf);

    expect(reports.exportCsv).toHaveBeenCalledWith('creator-1', 't1', 'hr-employees', expect.objectContaining({
      filters: [{ field: 'status', op: 'eq', value: 'ACTIVE' }],
    }));
    expect(email.sendRaw).toHaveBeenCalledTimes(2);
    expect(email.sendRaw).toHaveBeenCalledWith('t1', 'hr@acme.com', expect.stringContaining('Weekly actives'), expect.any(String),
      [{ filename: 'r.csv', content: 'a,b\n1,2' }]);
    expect(results[0]).toMatchObject({ status: 'SENT', recipients: 2 });

    const savedSchedule = scheduleRepo.save.mock.calls[0][0];
    expect(savedSchedule.lastStatus).toBe('SENT');
    expect(savedSchedule.nextRunAt.toISOString()).toBe('2026-07-15T06:00:00.000Z'); // rolled forward
  });

  it('a pinned view supplies the filters at run time', async () => {
    const { service, reports, scheduleRepo, viewRepo } = build();
    scheduleRepo.find.mockResolvedValue([dueSchedule({ viewId: 'v1', filters: [] })]);
    viewRepo.findOne.mockResolvedValue({ id: 'v1', reportCode: 'hr-employees', filters: [{ field: 'status', op: 'eq', value: 'EXITED' }], sortBy: 'createdAt', sortDir: 'ASC' });
    await service.runDueSchedules(asOf);
    expect(reports.exportCsv).toHaveBeenCalledWith('creator-1', 't1', 'hr-employees', expect.objectContaining({
      filters: [{ field: 'status', op: 'eq', value: 'EXITED' }], sortBy: 'createdAt', sortDir: 'ASC',
    }));
  });

  it('failures mark the schedule FAILED but still roll nextRunAt and never block others', async () => {
    const { service, reports, scheduleRepo, email } = build();
    scheduleRepo.find.mockResolvedValue([dueSchedule({ id: 's-bad' }), dueSchedule({ id: 's-good', recipients: ['ok@acme.com'] })]);
    reports.exportCsv
      .mockRejectedValueOnce(new Error('permission lost'))
      .mockResolvedValueOnce({ filename: 'r.csv', csv: 'a\n1' });
    const results = await service.runDueSchedules(asOf);

    expect(results.map(r => r.status)).toEqual(['FAILED', 'SENT']);
    expect(results[0].error).toMatch(/permission lost/);
    const badSaved = scheduleRepo.save.mock.calls[0][0];
    expect(badSaved.lastStatus).toBe('FAILED');
    expect(badSaved.nextRunAt.toISOString()).toBe('2026-07-15T06:00:00.000Z');
    expect(email.sendRaw).toHaveBeenCalledTimes(1); // only the good schedule
  });

  it('a failed email delivery surfaces as FAILED with the transport error', async () => {
    const { service, scheduleRepo, email } = build();
    scheduleRepo.find.mockResolvedValue([dueSchedule({ recipients: ['x@y.co'] })]);
    email.sendRaw.mockResolvedValue({ status: 'FAILED', error: 'No active SMTP configuration found' });
    const results = await service.runDueSchedules(asOf);
    expect(results[0]).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/SMTP/) });
  });
});

describe('lifecycle', () => {
  it('only the creator can pause/resume or delete', async () => {
    const { service, scheduleRepo } = build();
    scheduleRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', createdByUserId: 'someone-else', cadence: ReportCadence.DAILY, hourUtc: 6 });
    await expect(service.setActive('u1', 't1', 's1', false)).rejects.toThrow(ForbiddenException);
    await expect(service.remove('u1', 't1', 's1')).rejects.toThrow(ForbiddenException);

    scheduleRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', createdByUserId: 'u1', cadence: ReportCadence.DAILY, hourUtc: 6, active: false });
    const resumed = await service.setActive('u1', 't1', 's1', true);
    expect(resumed.active).toBe(true);
    expect(resumed.nextRunAt).toBeInstanceOf(Date); // recomputed on resume
    await expect(service.remove('u1', 't1', 's1')).resolves.toEqual({ deleted: true });
  });
});
