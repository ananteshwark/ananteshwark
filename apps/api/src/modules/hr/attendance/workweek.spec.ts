import { BadRequestException } from '@nestjs/common';
import { WorkweekService } from './workweek.service';
import { BreakType, InfractionType, InfractionStatus } from './entities/workweek.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('WorkweekService', () => {
  let service: WorkweekService;
  let breakRepo: any, infractionRepo: any, fwwRepo: any, automation: any;

  beforeEach(() => {
    breakRepo = mockRepo(); infractionRepo = mockRepo(); fwwRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new WorkweekService(breakRepo, infractionRepo, fwwRepo, automation);
  });

  describe('break rules', () => {
    it('reports a shortfall when the required break is not taken', async () => {
      breakRepo.find.mockResolvedValue([{ name: 'Meal', type: BreakType.MEAL, minWorkMinutes: 300, breakMinutes: 30 }]);
      const res = await service.evaluateBreaks('t1', 360, 10); // worked 6h, took 10m of a 30m break
      expect(res.requiredMinutes).toBe(30);
      expect(res.violations).toEqual([{ rule: 'Meal', type: BreakType.MEAL, shortfall: 20 }]);
    });

    it('no violation when the break threshold is not reached', async () => {
      breakRepo.find.mockResolvedValue([{ name: 'Meal', type: BreakType.MEAL, minWorkMinutes: 300, breakMinutes: 30 }]);
      const res = await service.evaluateBreaks('t1', 200, 0); // only 3h20 worked
      expect(res.requiredMinutes).toBe(0);
      expect(res.violations).toHaveLength(0);
    });
  });

  describe('infractions', () => {
    it('defaults the point weight by type and emits an event', async () => {
      const inf = await service.recordInfraction('t1', { employeeId: 'e1', date: '2026-07-01', type: InfractionType.NO_SHOW });
      expect(inf.points).toBe(4);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'attendance.infraction_recorded', expect.objectContaining({ type: InfractionType.NO_SHOW }));
    });

    it('sums non-waived points and flags escalation over the threshold', async () => {
      infractionRepo.find.mockResolvedValue([
        { points: 4, status: InfractionStatus.OPEN },
        { points: 2, status: InfractionStatus.OPEN },
        { points: 4, status: InfractionStatus.WAIVED }, // excluded
      ]);
      const res = await service.pointsInWindow('t1', 'e1', '2026-01-01', '2026-12-31');
      expect(res.points).toBe(6);
      expect(res.escalate).toBe(true);
      expect(res.count).toBe(2);
    });
  });

  describe('fair workweek', () => {
    it('flags a clopening violation and owes predictability pay', async () => {
      fwwRepo.findOne.mockResolvedValue({ minRestHoursBetweenShifts: 11, predictabilityPayHours: 1 });
      const res = await service.checkClopening('t1', '2026-07-01T22:00:00Z', '2026-07-02T06:00:00Z'); // 8h rest
      expect(res.violation).toBe(true);
      expect(res.restHours).toBe(8);
      expect(res.predictabilityPayHours).toBe(1);
      expect(automation.emit).toHaveBeenCalledWith('t1', 'attendance.fairworkweek_violation', expect.objectContaining({ kind: 'CLOPENING' }));
    });

    it('passes when rest meets the minimum', async () => {
      fwwRepo.findOne.mockResolvedValue({ minRestHoursBetweenShifts: 11, predictabilityPayHours: 1 });
      const res = await service.checkClopening('t1', '2026-07-01T20:00:00Z', '2026-07-02T09:00:00Z'); // 13h
      expect(res.violation).toBe(false);
      expect(res.predictabilityPayHours).toBe(0);
    });

    it('flags insufficient advance notice', async () => {
      fwwRepo.findOne.mockResolvedValue({ advanceNoticeDays: 14 });
      const res = await service.checkAdvanceNotice('t1', '2026-07-01', '2026-07-08'); // 7 days
      expect(res).toMatchObject({ noticeDays: 7, violation: true });
    });
  });

  describe('one view', () => {
    it('derives late-in, early-out and missed-break exceptions', async () => {
      breakRepo.find.mockResolvedValue([{ name: 'Meal', type: BreakType.MEAL, minWorkMinutes: 300, breakMinutes: 30 }]);
      infractionRepo.find.mockResolvedValue([]);
      const view = await service.oneView('t1', 'e1', '2026-07-01', {
        scheduledStart: '2026-07-01T09:00:00Z', scheduledEnd: '2026-07-01T17:00:00Z',
        actualStart: '2026-07-01T09:20:00Z', actualEnd: '2026-07-01T16:40:00Z', breakMinutesTaken: 10,
      });
      expect(view.exceptions).toEqual(expect.arrayContaining(['LATE_IN(20m)', 'EARLY_OUT(20m)', 'MISSED_BREAK']));
      expect(view.actual.workedMinutes).toBe(440);
    });

    it('flags a missed punch when scheduled but no actual start', async () => {
      infractionRepo.find.mockResolvedValue([]);
      const view = await service.oneView('t1', 'e1', '2026-07-01', { scheduledStart: '2026-07-01T09:00:00Z' });
      expect(view.exceptions).toContain('MISSED_PUNCH');
    });
  });
});
