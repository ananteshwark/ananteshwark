import { TimeEvaluationService } from './time-evaluation.service';

/**
 * Time evaluation: absence → LOP, late arrival beyond grace, early
 * departure, overtime above threshold with comp-off accrual, half-day
 * detection, and the monthly per-employee aggregation.
 */
describe('TimeEvaluationService', () => {
  let service: TimeEvaluationService;
  let rulesRepo: any, resultsRepo: any, attendanceRepo: any, shiftRepo: any, shiftAssignRepo: any, employeeRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  });

  // 09:00–18:00, 60m break → 480m duration, 10m grace
  const shift = { id: 'sh1', startTime: '09:00', endTime: '18:00', breakMinutes: 60, graceMinutesLate: 10, isActive: true, workingMinutes: null };

  const att = (over: any = {}) => ({
    employeeId: 'e1', date: '2026-07-01',
    checkIn: new Date('2026-07-01T09:00:00'), checkOut: new Date('2026-07-01T18:00:00'),
    workingMinutes: null, ...over,
  });

  beforeEach(() => {
    rulesRepo = mockRepo(); resultsRepo = mockRepo(); attendanceRepo = mockRepo();
    shiftRepo = mockRepo(); shiftAssignRepo = mockRepo(); employeeRepo = mockRepo();
    shiftRepo.find.mockResolvedValue([shift]);
    service = new TimeEvaluationService(rulesRepo, resultsRepo, attendanceRepo, shiftRepo, shiftAssignRepo, employeeRepo);
  });

  const lastResult = () => resultsRepo.save.mock.calls.at(-1)[0];

  it('a day with no check-in is absent with a full LOP day', async () => {
    attendanceRepo.find.mockResolvedValue([att({ checkIn: null, checkOut: null })]);
    const summary = await service.runEvaluation('t1', 7, 2026);
    expect(summary).toMatchObject({ totalEvaluated: 1, totalAbsent: 1, totalLopDays: 1 });
    expect(lastResult()).toMatchObject({ isAbsent: true, lopDays: 1 });
  });

  it('arrival within grace is not late; beyond grace records the full lateness', async () => {
    attendanceRepo.find.mockResolvedValue([att({ checkIn: new Date('2026-07-01T09:08:00') })]);
    await service.runEvaluation('t1', 7, 2026);
    expect(lastResult().lateMinutes).toBe(0);

    attendanceRepo.find.mockResolvedValue([att({ checkIn: new Date('2026-07-01T09:20:00') })]);
    await service.runEvaluation('t1', 7, 2026);
    expect(lastResult().lateMinutes).toBe(20); // measured from shift start, not grace end
  });

  it('early departure is measured against the shift end', async () => {
    attendanceRepo.find.mockResolvedValue([att({ checkOut: new Date('2026-07-01T17:15:00') })]);
    await service.runEvaluation('t1', 7, 2026);
    expect(lastResult().earlyDepartureMinutes).toBe(45);
  });

  it('overtime above the threshold is recorded and earns comp-off when enabled', async () => {
    rulesRepo.find.mockResolvedValue([{ type: 'OVERTIME', isActive: true, thresholdMinutes: 30, compOffEnabled: true }]);
    // 09:00–19:00 = 600m worked vs 480m duration → 120m excess
    attendanceRepo.find.mockResolvedValue([att({ checkOut: new Date('2026-07-01T19:00:00') })]);
    const summary = await service.runEvaluation('t1', 7, 2026);
    expect(lastResult().overtimeMinutes).toBe(120);
    expect(lastResult().compOffEarned).toBe(2);
    expect(summary.totalOtHours).toBe(2);
  });

  it('excess under the OT threshold is ignored', async () => {
    // 540m worked vs 480 → 60m excess but threshold 90
    rulesRepo.find.mockResolvedValue([{ type: 'OVERTIME', isActive: true, thresholdMinutes: 90 }]);
    attendanceRepo.find.mockResolvedValue([att({ checkOut: new Date('2026-07-01T18:00:00'), workingMinutes: 540 })]);
    await service.runEvaluation('t1', 7, 2026);
    expect(lastResult().overtimeMinutes).toBe(0);
  });

  it('working under half the shift flags a half day with 0.5 LOP', async () => {
    attendanceRepo.find.mockResolvedValue([att({ checkOut: new Date('2026-07-01T12:00:00') })]); // 180m < 240
    const summary = await service.runEvaluation('t1', 7, 2026);
    expect(lastResult()).toMatchObject({ isHalfDay: true, lopDays: 0.5 });
    expect(summary.totalLopDays).toBe(0.5);
  });

  it('getMonthlyReport aggregates per employee with hour rounding', async () => {
    resultsRepo.find.mockResolvedValue([
      { employeeId: 'e1', isAbsent: false, workingMinutes: 480, lateMinutes: 15, overtimeMinutes: 60, lopDays: 0 },
      { employeeId: 'e1', isAbsent: true, workingMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, lopDays: 1 },
    ]);
    employeeRepo.find.mockResolvedValue([{ id: 'e1', firstName: 'Ada', lastName: 'L' }]);
    const [row] = await service.getMonthlyReport('t1', 7, 2026);
    expect(row).toMatchObject({
      employeeName: 'Ada L', daysWorked: 1, absentDays: 1, lateDays: 1,
      lopDays: 1, totalWorkingHours: 8, overtimeHours: 1,
    });
  });

  it('saveRules updates existing rules in place and creates new ones', async () => {
    rulesRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', type: 'LATE_ARRIVAL', graceMinutes: 5 });
    const saved = await service.saveRules('t1', [
      { id: 'r1', graceMinutes: 15 },
      { type: 'OVERTIME', thresholdMinutes: 45 },
    ] as any);
    expect(saved).toHaveLength(2);
    expect(saved[0].graceMinutes).toBe(15);
    expect(rulesRepo.create).toHaveBeenCalledTimes(1); // only the new rule
  });
});
