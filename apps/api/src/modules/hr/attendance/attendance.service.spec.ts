import { NotFoundException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceSource, AttendanceStatus } from './entities/attendance-record.entity';
import { TimesheetStatus } from './entities/timesheet.entity';

/**
 * Attendance: working-minutes computation, upsert semantics for a day's
 * record, regularization, time-entry duration, and the timesheet
 * submit/approve flow (including week upsert).
 */
describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceRepo: any, shiftRepo: any, shiftAssignmentRepo: any,
    holidayRepo: any, timeEntryRepo: any, timesheetRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    attendanceRepo = mockRepo(); shiftRepo = mockRepo(); shiftAssignmentRepo = mockRepo();
    holidayRepo = mockRepo(); timeEntryRepo = mockRepo(); timesheetRepo = mockRepo();
    service = new AttendanceService(
      attendanceRepo, shiftRepo, shiftAssignmentRepo, holidayRepo, timeEntryRepo, timesheetRepo,
    );
  });

  it('markAttendance computes working minutes from check-in/out', async () => {
    const rec = await service.markAttendance('t1', {
      employeeId: 'e1', date: '2026-07-01',
      checkIn: '2026-07-01T09:00:00Z', checkOut: '2026-07-01T17:30:00Z',
    } as any);
    expect(rec.workingMinutes).toBe(510); // 8.5h
    expect(rec.status).toBe(AttendanceStatus.PRESENT);
    expect(rec.source).toBe(AttendanceSource.MANUAL);
  });

  it('markAttendance updates the existing record for the same employee+date', async () => {
    const existing: any = { id: 'a1', tenantId: 't1', employeeId: 'e1', date: '2026-07-01', checkIn: new Date('2026-07-01T09:00:00Z') };
    attendanceRepo.findOne.mockResolvedValue(existing);
    await service.markAttendance('t1', {
      employeeId: 'e1', date: '2026-07-01', checkOut: '2026-07-01T18:00:00Z',
    } as any);
    expect(attendanceRepo.create).not.toHaveBeenCalled();
    expect(existing.checkOut).toEqual(new Date('2026-07-01T18:00:00Z'));
  });

  it('regularize flags the record with approver and remarks', async () => {
    attendanceRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1' });
    const r = await service.regularize('t1', 'a1', 'forgot badge', 'mgr1');
    expect(r.isRegularized).toBe(true);
    expect(r.approvedById).toBe('mgr1');

    attendanceRepo.findOne.mockResolvedValue(null);
    await expect(service.regularize('t1', 'ghost', 'x', 'mgr1')).rejects.toThrow(NotFoundException);
  });

  it('createTimeEntry derives durationMinutes from the interval', async () => {
    const e = await service.createTimeEntry('t1', {
      employeeId: 'e1', date: '2026-07-01',
      startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:45:00Z',
    } as any);
    expect(e.durationMinutes).toBe(105);
  });

  it('submitTimesheet upserts the week and stamps submission', async () => {
    const ts = await service.submitTimesheet('t1', 'e1', '2026-06-29', '2026-07-05');
    expect(ts.status).toBe(TimesheetStatus.SUBMITTED);
    expect(ts.submittedAt).toBeInstanceOf(Date);

    const existing: any = { id: 'ts1', tenantId: 't1', status: TimesheetStatus.DRAFT };
    timesheetRepo.findOne.mockResolvedValue(existing);
    await service.submitTimesheet('t1', 'e1', '2026-06-29', '2026-07-05');
    expect(existing.status).toBe(TimesheetStatus.SUBMITTED);
  });

  it('approveTimesheet stamps approver, 404s when missing', async () => {
    timesheetRepo.findOne.mockResolvedValue({ id: 'ts1', tenantId: 't1', status: TimesheetStatus.SUBMITTED });
    const ts = await service.approveTimesheet('t1', 'ts1', 'mgr1');
    expect(ts.status).toBe(TimesheetStatus.APPROVED);
    expect(ts.approvedById).toBe('mgr1');

    timesheetRepo.findOne.mockResolvedValue(null);
    await expect(service.approveTimesheet('t1', 'ghost', 'mgr1')).rejects.toThrow(NotFoundException);
  });
});
