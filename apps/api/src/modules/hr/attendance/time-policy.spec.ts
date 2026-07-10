import { BadRequestException } from '@nestjs/common';
import { TimePolicyService } from './time-policy.service';
import { AttendanceStatus } from './entities/attendance-record.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => x),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('TimePolicyService', () => {
  let service: TimePolicyService;
  let patternRepo: any, assignmentRepo: any, geofenceRepo: any, attendanceRepo: any;

  beforeEach(() => {
    patternRepo = mockRepo(); assignmentRepo = mockRepo(); geofenceRepo = mockRepo(); attendanceRepo = mockRepo();
    service = new TimePolicyService(patternRepo, assignmentRepo, geofenceRepo, attendanceRepo);
  });

  describe('shift patterns', () => {
    it('requires exactly 7 weekly slots', async () => {
      await expect(service.createPattern('t1', { name: 'X', weekSlots: ['a', 'b'] } as any))
        .rejects.toThrow('exactly 7');
    });

    it('generates one assignment per employee per working day, skipping rest days', async () => {
      // Mon-Fri = shift-day, Sat/Sun = OFF (2026-07-13 is a Monday)
      patternRepo.findOne.mockResolvedValue({
        id: 'p1', tenantId: 't1', rotating: false,
        weekSlots: ['shift-day', 'shift-day', 'shift-day', 'shift-day', 'shift-day', 'OFF', null],
      });
      const result = await service.generateAssignments('t1', 'p1', {
        employeeIds: ['e1', 'e2'], from: '2026-07-13', to: '2026-07-19', // one full week
      });
      // 5 working days × 2 employees = 10 assignments; weekend skipped for both
      expect(result.created).toBe(10);
      expect(result.skippedRestDays).toBe(4); // Sat+Sun × 2 employees
      const saved = assignmentRepo.save.mock.calls[0][0];
      expect(saved[0]).toMatchObject({ employeeId: 'e1', shiftId: 'shift-day', effectiveFrom: '2026-07-13', effectiveTo: '2026-07-13' });
    });

    it('deduplicates employees and validates the range', async () => {
      patternRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', weekSlots: Array(7).fill('s') });
      await expect(service.generateAssignments('t1', 'p1', { employeeIds: [], from: '2026-07-01', to: '2026-07-02' }))
        .rejects.toThrow('At least one employeeId');
      await expect(service.generateAssignments('t1', 'p1', { employeeIds: ['e1'], from: '2026-07-10', to: '2026-07-01' }))
        .rejects.toThrow('valid from/to');
    });
  });

  describe('geofencing', () => {
    it('haversine computes a sane distance', () => {
      // ~111 m per 0.001° latitude near the equator
      const d = TimePolicyService.haversineMeters(0, 0, 0.001, 0);
      expect(d).toBeGreaterThan(100);
      expect(d).toBeLessThan(120);
    });

    it('passes all check-ins when no fences exist', async () => {
      geofenceRepo.find.mockResolvedValue([]);
      expect(await service.validateCheckin('t1', { lat: 1, lng: 1 })).toEqual({ allowed: true });
    });

    it('requires coordinates, enforces radius and IP allowlist', async () => {
      geofenceRepo.find.mockResolvedValue([
        { id: 'f1', lat: 12.9716, lng: 77.5946, radiusMeters: 200, allowedIps: ['10.0.0.5'] },
      ]);
      expect((await service.validateCheckin('t1', {})).allowed).toBe(false);

      // Inside radius but wrong IP
      const wrongIp = await service.validateCheckin('t1', { lat: 12.9716, lng: 77.5946, ip: '8.8.8.8' });
      expect(wrongIp).toMatchObject({ allowed: false, fenceId: 'f1' });

      // Inside radius, allowed IP
      const ok = await service.validateCheckin('t1', { lat: 12.9716, lng: 77.5946, ip: '10.0.0.5' });
      expect(ok).toMatchObject({ allowed: true, fenceId: 'f1' });

      // Far outside every fence
      const outside = await service.validateCheckin('t1', { lat: 0, lng: 0, ip: '10.0.0.5' });
      expect(outside.allowed).toBe(false);
    });
  });

  describe('absconding sweep', () => {
    it('flags consecutive-absent streaks meeting the threshold, ignoring weekends/leave', async () => {
      attendanceRepo.find.mockResolvedValue([
        { employeeId: 'e1', date: '2026-07-06', status: AttendanceStatus.PRESENT },
        { employeeId: 'e1', date: '2026-07-07', status: AttendanceStatus.ABSENT },
        { employeeId: 'e1', date: '2026-07-08', status: AttendanceStatus.ABSENT },
        { employeeId: 'e1', date: '2026-07-09', status: AttendanceStatus.ABSENT },
        // e2 has absences broken by a weekend and a present day
        { employeeId: 'e2', date: '2026-07-07', status: AttendanceStatus.ABSENT },
        { employeeId: 'e2', date: '2026-07-08', status: AttendanceStatus.WEEKEND },
        { employeeId: 'e2', date: '2026-07-09', status: AttendanceStatus.PRESENT },
      ]);
      const flagged = await service.abscondingSweep('t1', { asOf: '2026-07-09', threshold: 3 });
      expect(flagged).toEqual([{ employeeId: 'e1', consecutiveAbsent: 3, since: '2026-07-07' }]);
    });

    it('a weekend inside the streak does not break it', async () => {
      attendanceRepo.find.mockResolvedValue([
        { employeeId: 'e1', date: '2026-07-09', status: AttendanceStatus.ABSENT },
        { employeeId: 'e1', date: '2026-07-10', status: AttendanceStatus.ABSENT },
        { employeeId: 'e1', date: '2026-07-11', status: AttendanceStatus.WEEKEND },
        { employeeId: 'e1', date: '2026-07-12', status: AttendanceStatus.WEEKEND },
        { employeeId: 'e1', date: '2026-07-13', status: AttendanceStatus.ABSENT },
      ]);
      const flagged = await service.abscondingSweep('t1', { asOf: '2026-07-13', threshold: 3 });
      expect(flagged[0]).toMatchObject({ employeeId: 'e1', consecutiveAbsent: 3 });
    });
  });
});
