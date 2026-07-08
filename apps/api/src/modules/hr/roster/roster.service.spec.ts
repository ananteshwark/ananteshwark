import { BadRequestException } from '@nestjs/common';
import { RosterService, weekOf } from './roster.service';
import { RosterEntryStatus, RosterSource } from './roster.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: `gen-${Math.random().toString(36).slice(2, 6)}`, ...x })),
  save: jest.fn((x: any) => Promise.resolve(x)),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  count: jest.fn().mockResolvedValue(0),
});

describe('weekOf', () => {
  it('maps any date to the Monday of its ISO week', () => {
    expect(weekOf('2026-07-06')).toBe('2026-07-06'); // a Monday
    expect(weekOf('2026-07-12')).toBe('2026-07-06'); // the following Sunday
    expect(weekOf('2026-07-13')).toBe('2026-07-13'); // next Monday
  });
});

describe('RosterService', () => {
  let service: RosterService;
  let demandRepo: any, entryRepo: any, shiftRepo: any, employeeRepo: any, leaveRepo: any;
  const automation = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    demandRepo = mockRepo(); entryRepo = mockRepo(); shiftRepo = mockRepo();
    employeeRepo = mockRepo(); leaveRepo = mockRepo();
    automation.emit.mockClear();
    service = new RosterService(demandRepo, entryRepo, shiftRepo, employeeRepo, leaveRepo, automation as any);
  });

  describe('manual assignment guards', () => {
    beforeEach(() => {
      demandRepo.findOne.mockResolvedValue({ id: 'd1', tenantId: 't1', shiftId: 's1', date: '2026-07-08', requiredHeadcount: 2 });
      employeeRepo.findOne.mockResolvedValue({ id: 'e1', tenantId: 't1', firstName: 'Asha', lastName: 'Rao' });
    });

    it('blocks over-staffing a full demand', async () => {
      entryRepo.count.mockResolvedValue(2);
      await expect(service.assign('t1', 'd1', 'e1')).rejects.toThrow('fully staffed');
    });

    it('blocks double-booking the same employee on the same date', async () => {
      entryRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(service.assign('t1', 'd1', 'e1')).rejects.toThrow('already rostered');
    });

    it('blocks assignment during approved leave', async () => {
      leaveRepo.find.mockResolvedValue([
        { employeeId: 'e1', fromDate: '2026-07-07', toDate: '2026-07-09', status: 'APPROVED' },
      ]);
      await expect(service.assign('t1', 'd1', 'e1')).rejects.toThrow('approved leave');
    });

    it('assigns when all rules pass', async () => {
      const entry = await service.assign('t1', 'd1', 'e1');
      expect(entry.employeeName).toBe('Asha Rao');
      expect(entry.status).toBe(RosterEntryStatus.DRAFT);
      expect(entry.source).toBe(RosterSource.MANUAL);
    });
  });

  describe('autoAssign', () => {
    const employees = [
      { id: 'e1', firstName: 'A', lastName: 'One' },
      { id: 'e2', firstName: 'B', lastName: 'Two' },
      { id: 'e3', firstName: 'C', lastName: 'Three' },
    ];

    it('fills open slots fairly and reports unfillable shortfalls', async () => {
      demandRepo.find.mockResolvedValue([
        { id: 'd1', shiftId: 's1', shiftName: 'Morning', date: '2026-07-08', requiredHeadcount: 2, departmentId: null },
        { id: 'd2', shiftId: 's2', shiftName: 'Night', date: '2026-07-08', requiredHeadcount: 2, departmentId: null },
      ]);
      employeeRepo.find.mockResolvedValue(employees);
      const result = await service.autoAssign('t1', { from: '2026-07-06', to: '2026-07-12' });
      // 3 people, 4 slots on one day, no double-booking → 3 assigned, 1 short
      expect(result.assigned).toBe(3);
      expect(result.unfilled).toEqual([
        { demandId: 'd2', date: '2026-07-08', shiftName: 'Night', shortfall: 1 },
      ]);
      const saved = entryRepo.save.mock.calls[0][0];
      const perEmployee = new Set(saved.map((e: any) => e.employeeId));
      expect(perEmployee.size).toBe(3); // nobody doubled up
      expect(saved.every((e: any) => e.source === RosterSource.AUTO)).toBe(true);
    });

    it('respects the weekly shift cap', async () => {
      // 6 daily demands Mon–Sat, one employee, cap 5 → 5 filled, 1 short.
      const days = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11'];
      demandRepo.find.mockResolvedValue(days.map((date, i) => ({
        id: `d${i}`, shiftId: 's1', shiftName: 'Day', date, requiredHeadcount: 1, departmentId: null,
      })));
      employeeRepo.find.mockResolvedValue([employees[0]]);
      const result = await service.autoAssign('t1', { from: days[0], to: days[5], maxShiftsPerWeek: 5 });
      expect(result.assigned).toBe(5);
      expect(result.unfilled).toHaveLength(1);
      expect(result.unfilled[0].date).toBe('2026-07-11');
    });

    it('never assigns someone on approved leave', async () => {
      demandRepo.find.mockResolvedValue([
        { id: 'd1', shiftId: 's1', shiftName: 'Day', date: '2026-07-08', requiredHeadcount: 1, departmentId: null },
      ]);
      employeeRepo.find.mockResolvedValue([employees[0]]);
      leaveRepo.find.mockResolvedValue([
        { employeeId: 'e1', fromDate: '2026-07-08', toDate: '2026-07-08' },
      ]);
      const result = await service.autoAssign('t1', { from: '2026-07-08', to: '2026-07-08' });
      expect(result.assigned).toBe(0);
      expect(result.unfilled[0].shortfall).toBe(1);
    });
  });

  it('publish flips drafts in range and emits roster.published', async () => {
    entryRepo.find.mockResolvedValue([
      { id: 'r1', status: RosterEntryStatus.DRAFT },
      { id: 'r2', status: RosterEntryStatus.DRAFT },
    ]);
    const result = await service.publish('t1', '2026-07-06', '2026-07-12');
    expect(result.published).toBe(2);
    expect(entryRepo.save.mock.calls[0][0].every((e: any) => e.status === RosterEntryStatus.PUBLISHED)).toBe(true);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'roster.published', expect.objectContaining({ entryCount: 2 }));
  });

  it('demand upsert validates and updates in place', async () => {
    shiftRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', name: 'Morning' });
    await expect(service.upsertDemand('t1', { shiftId: 's1', date: '2026-07-08', requiredHeadcount: 0 }))
      .rejects.toThrow(BadRequestException);
    demandRepo.findOne.mockResolvedValue({ id: 'd1', requiredHeadcount: 2, notes: null });
    const updated = await service.upsertDemand('t1', { shiftId: 's1', date: '2026-07-08', requiredHeadcount: 4 });
    expect(updated.requiredHeadcount).toBe(4);
  });
});
