import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { OccasionType } from './entities/leave-type.entity';
import { EncashmentStatus } from './entities/leave-encashment.entity';
import { AccrualSource } from './entities/leave-accrual-log.entity';

/**
 * Phase 1 absence depth: hourly conversion, sandwich rule, blackout windows,
 * date-window and usage-count limits, interdependent types, encashment
 * lifecycle, and occasion (birthday/anniversary) auto-grants.
 */
describe('LeaveService — policy depth', () => {
  let service: LeaveService;
  let leaveTypeRepo: any, balanceRepo: any, applicationRepo: any, accrualLogRepo: any;
  let employeeRepo: any, blackoutRepo: any, encashmentRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(),
  });

  const qb = (over: any = {}) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getCount: jest.fn().mockResolvedValue(0),
    ...over,
  });

  beforeEach(() => {
    leaveTypeRepo = mockRepo(); balanceRepo = mockRepo();
    applicationRepo = mockRepo(); accrualLogRepo = mockRepo();
    employeeRepo = mockRepo(); blackoutRepo = mockRepo(); encashmentRepo = mockRepo();
    service = new LeaveService(
      leaveTypeRepo, balanceRepo, applicationRepo, accrualLogRepo,
      employeeRepo, undefined, undefined, blackoutRepo, encashmentRepo,
    );
    applicationRepo.createQueryBuilder.mockReturnValue(qb());
    blackoutRepo.createQueryBuilder.mockReturnValue(qb());
    leaveTypeRepo.createQueryBuilder.mockReturnValue(qb());
    balanceRepo.findOne.mockResolvedValue({ openingBalance: 20, accrued: 0, taken: 0, adjusted: 0 });
  });

  const leaveType = (over: any = {}) => ({
    id: 'lt1', name: 'Privilege Leave', hoursPerDay: 8, allowHourly: false, sandwichRule: false,
    maxBackdatedDays: null, maxAdvanceDays: null, maxApplicationsPerYear: null,
    requiresExhaustedTypeId: null, isEncashable: false, accrualRate: 0, ...over,
  });

  const futureDate = (daysAhead: number) => {
    const d = new Date(Date.now() + daysAhead * 86_400_000);
    return d.toISOString().slice(0, 10);
  };

  const applyDto = (over: any = {}) => ({
    employeeId: 'e1', leaveTypeId: 'lt1', fromDate: futureDate(3), toDate: futureDate(3), days: 1, reason: 'r', ...over,
  });

  describe('hourly leave', () => {
    it('converts hours to day-fractions via the type hoursPerDay', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ allowHourly: true, hoursPerDay: 8 }));
      const app = await service.applyLeave('t1', applyDto({ hours: 2, days: 0 }) as any);
      expect(Number(app.days)).toBe(0.25);
      expect(Number(app.hours)).toBe(2);
    });

    it('rejects hourly applications on non-hourly types', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ allowHourly: false }));
      await expect(service.applyLeave('t1', applyDto({ hours: 2 }) as any))
        .rejects.toThrow('does not allow hourly');
    });
  });

  describe('sandwich rule', () => {
    it('books the full inclusive span including the weekend inside', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ sandwichRule: true }));
      // Friday + following Monday applied as 2 days → 4 booked (Sat+Sun sandwiched)
      const app = await service.applyLeave('t1', applyDto({
        fromDate: '2026-07-17', toDate: '2026-07-20', days: 2,
      }) as any);
      expect(Number(app.days)).toBe(4);
    });

    it('leaves the requested days alone when the span matches', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ sandwichRule: true }));
      const app = await service.applyLeave('t1', applyDto({
        fromDate: '2026-07-14', toDate: '2026-07-15', days: 2,
      }) as any);
      expect(Number(app.days)).toBe(2);
    });
  });

  describe('date windows and usage limits', () => {
    it('rejects backdating beyond maxBackdatedDays', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ maxBackdatedDays: 2 }));
      await expect(service.applyLeave('t1', applyDto({ fromDate: futureDate(-10), toDate: futureDate(-10) }) as any))
        .rejects.toThrow('backdated at most 2');
    });

    it('rejects applications too far in advance', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ maxAdvanceDays: 30 }));
      await expect(service.applyLeave('t1', applyDto({ fromDate: futureDate(60), toDate: futureDate(60) }) as any))
        .rejects.toThrow('at most 30 day(s) in advance');
    });

    it('rejects when the yearly application count is exhausted', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ maxApplicationsPerYear: 2 }));
      applicationRepo.createQueryBuilder.mockReturnValue(qb({ getCount: jest.fn().mockResolvedValue(2) }));
      await expect(service.applyLeave('t1', applyDto() as any)).rejects.toThrow('at most 2 application(s) per year');
    });
  });

  describe('interdependent types and blackouts', () => {
    it('blocks usage until the prerequisite type is exhausted', async () => {
      leaveTypeRepo.findOne
        .mockResolvedValueOnce(leaveType({ requiresExhaustedTypeId: 'lt-pl' })) // applied type
        .mockResolvedValueOnce({ id: 'lt-pl', name: 'Privilege Leave' });        // prerequisite lookup
      balanceRepo.findOne.mockResolvedValueOnce({ openingBalance: 3, accrued: 0, taken: 0, adjusted: 0 }); // prereq has balance
      await expect(service.applyLeave('t1', applyDto() as any))
        .rejects.toThrow('only be used after Privilege Leave is exhausted');
    });

    it('rejects applications overlapping an active blackout window', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType());
      blackoutRepo.createQueryBuilder.mockReturnValue(qb({
        getOne: jest.fn().mockResolvedValue({ name: 'Quarter close', fromDate: '2026-07-01', toDate: '2026-07-31' }),
      }));
      await expect(service.applyLeave('t1', applyDto() as any)).rejects.toThrow('Quarter close');
    });

    it('blackout CRUD validates dates and deactivates', async () => {
      await expect(service.createBlackout('t1', { name: 'X', fromDate: '2026-08-10', toDate: '2026-08-01' }))
        .rejects.toThrow(BadRequestException);
      const created = await service.createBlackout('t1', { name: 'Audit week', fromDate: '2026-08-01', toDate: '2026-08-07' });
      expect(created.name).toBe('Audit week');
      blackoutRepo.findOne.mockResolvedValue({ id: 'b1', isActive: true });
      const off = await service.deactivateBlackout('t1', 'b1');
      expect(off.isActive).toBe(false);
    });
  });

  describe('encashment', () => {
    it('requires an encashable type and sufficient balance', async () => {
      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ isEncashable: false }));
      await expect(service.requestEncashment('t1', { employeeId: 'e1', leaveTypeId: 'lt1', units: 5 }))
        .rejects.toThrow('not encashable');

      leaveTypeRepo.findOne.mockResolvedValue(leaveType({ isEncashable: true }));
      balanceRepo.findOne.mockResolvedValue({ openingBalance: 3, accrued: 0, taken: 0, adjusted: 0 });
      await expect(service.requestEncashment('t1', { employeeId: 'e1', leaveTypeId: 'lt1', units: 5 }))
        .rejects.toThrow('Insufficient balance');

      balanceRepo.findOne.mockResolvedValue({ openingBalance: 10, accrued: 0, taken: 0, adjusted: 0 });
      const request = await service.requestEncashment('t1', { employeeId: 'e1', leaveTypeId: 'lt1', units: 5 });
      expect(request.status).toBe(EncashmentStatus.REQUESTED);
    });

    it('approval deducts via adjustment, logs it, and emits leave.encashed', async () => {
      const automation = { emit: jest.fn().mockResolvedValue(undefined) };
      service = new LeaveService(
        leaveTypeRepo, balanceRepo, applicationRepo, accrualLogRepo,
        employeeRepo, undefined, automation as any, blackoutRepo, encashmentRepo,
      );
      encashmentRepo.findOne.mockResolvedValue({
        id: 'enc1', tenantId: 't1', employeeId: 'e1', leaveTypeId: 'lt1',
        leaveYear: 2026, units: 5, status: EncashmentStatus.REQUESTED,
      });
      const bal: any = { openingBalance: 10, accrued: 0, taken: 0, adjusted: 0 };
      balanceRepo.findOne.mockResolvedValue(bal);
      const approved = await service.approveEncashment('t1', 'enc1', 'mgr1');
      expect(approved.status).toBe(EncashmentStatus.APPROVED);
      expect(bal.adjusted).toBe(-5);
      expect(accrualLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ units: -5, source: AccrualSource.ENCASHMENT }));
      expect(automation.emit).toHaveBeenCalledWith('t1', 'leave.encashed', expect.objectContaining({ units: 5 }));

      // Only REQUESTED can be approved again
      encashmentRepo.findOne.mockResolvedValue({ id: 'enc1', status: EncashmentStatus.APPROVED });
      await expect(service.approveEncashment('t1', 'enc1', 'mgr1')).rejects.toThrow('Only REQUESTED');
    });
  });

  describe('occasion auto-grants', () => {
    it('grants birthday leave once per year, skipping non-matching dates', async () => {
      leaveTypeRepo.createQueryBuilder.mockReturnValue(qb({
        getMany: jest.fn().mockResolvedValue([leaveType({ id: 'lt-bd', occasionType: OccasionType.BIRTHDAY, accrualRate: 0 })]),
      }));
      employeeRepo.find.mockResolvedValue([
        { id: 'e1', dateOfBirth: '1990-07-09', dateOfJoining: '2020-01-01' }, // matches
        { id: 'e2', dateOfBirth: '1985-12-25', dateOfJoining: '2019-03-03' }, // no match
      ]);
      balanceRepo.findOne.mockResolvedValue(null);
      balanceRepo.create.mockReturnValue({ accrued: 0 });
      accrualLogRepo.findOne.mockResolvedValue(null);

      const result = await service.grantOccasionLeaves('t1', '2026-07-09');
      expect(result.granted).toBe(1);
      expect(accrualLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        employeeId: 'e1', units: 1, source: AccrualSource.OCCASION,
      }));

      // Second run the same year is a no-op (idempotent)
      accrualLogRepo.findOne.mockResolvedValue({ id: 'existing' });
      const rerun = await service.grantOccasionLeaves('t1', '2026-07-09');
      expect(rerun.granted).toBe(0);
    });

    it('anniversary grants skip the joining year itself', async () => {
      leaveTypeRepo.createQueryBuilder.mockReturnValue(qb({
        getMany: jest.fn().mockResolvedValue([leaveType({ id: 'lt-an', occasionType: OccasionType.ANNIVERSARY })]),
      }));
      employeeRepo.find.mockResolvedValue([
        { id: 'e-new', dateOfBirth: null, dateOfJoining: '2026-07-09' }, // joined today → no grant
      ]);
      const result = await service.grantOccasionLeaves('t1', '2026-07-09');
      expect(result.granted).toBe(0);
    });
  });
});
