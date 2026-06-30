import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { OtlService } from './otl.service';
import { OtlTimeRule } from './entities/otl-time-rule.entity';
import { OtlTimecardResult } from './entities/otl-timecard-result.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  count: jest.fn().mockResolvedValue(0),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

const elem = (r: any, code: string) => (r.elements as any[]).find((e) => e.code === code);

describe('OtlService — Phase 194-197', () => {
  let service: OtlService;
  let ruleRepo: any, resultRepo: any;

  beforeEach(async () => {
    ruleRepo = mockRepo(); resultRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        OtlService,
        { provide: getRepositoryToken(OtlTimeRule), useValue: ruleRepo },
        { provide: getRepositoryToken(OtlTimecardResult), useValue: resultRepo },
      ],
    }).compile();
    service = module.get(OtlService);
  });

  // ─── Ph-194: rules ────────────────────────────────────────────────

  it('seedDefaults — refuses when rules already exist', async () => {
    ruleRepo.count.mockResolvedValue(3);
    await expect(service.seedDefaults('t1')).rejects.toThrow(BadRequestException);
  });

  it('seedDefaults — creates the standard rule set', async () => {
    ruleRepo.count.mockResolvedValue(0);
    const r = await service.seedDefaults('t1');
    expect(r).toHaveLength(5);
  });

  // ─── Ph-194: overtime triggers (defaults) ─────────────────────────

  it('processTimecard — daily OT beyond 8h', async () => {
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.processTimecard('t1', 'e1', '2026-06-01', [
      { date: '2026-06-01', hours: 10 },
    ]);
    expect(r.regularHours).toBe(8);
    expect(r.overtimeHours).toBe(2);
    expect(elem(r, 'OT').multiplier).toBe(1.5);
  });

  it('processTimecard — weekly OT beyond 40h regular', async () => {
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const days = Array.from({ length: 6 }, (_, i) => ({ date: `2026-06-0${i + 1}`, hours: 8 }));
    const r = await service.processTimecard('t1', 'e1', '2026-06-01', days);
    // 6 × 8 = 48 worked, all within daily 8 → 40 regular + 8 weekly OT
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(8);
  });

  it('processTimecard — 7th consecutive day at premium', async () => {
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-06-0${i + 1}`, hours: 6 }));
    const r = await service.processTimecard('t1', 'e1', '2026-06-01', days);
    // days 1-6 = 36 regular (<40), day 7 = 6 premium hours @2x
    expect(r.premiumHours).toBe(6);
    expect(elem(r, 'OT2').multiplier).toBe(2);
    expect(r.regularHours).toBe(36);
  });

  // ─── Ph-195: shift differentials ──────────────────────────────────

  it('processTimecard — night differential element', async () => {
    resultRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.processTimecard('t1', 'e1', '2026-06-01', [
      { date: '2026-06-01', hours: 8, isNight: true },
    ]);
    const diff = elem(r, 'DIFF_NIGHT');
    expect(diff.hours).toBe(8);
    expect(diff.multiplier).toBe(0.15);
  });

  // ─── Ph-196: absence integration ──────────────────────────────────

  it('reconcileAbsence — leave covers shortfall up to balance', () => {
    const r = service.reconcileAbsence({ scheduledHours: 8, workedHours: 5, approvedLeaveHours: 3, leaveBalanceHours: 10 });
    expect(r.shortfall).toBe(3);
    expect(r.leaveApplied).toBe(3);
    expect(r.unpaidShortfall).toBe(0);
    expect(r.newLeaveBalance).toBe(7);
    expect(r.paidHours).toBe(8);
  });

  it('reconcileAbsence — unpaid remainder when leave insufficient', () => {
    const r = service.reconcileAbsence({ scheduledHours: 8, workedHours: 4, approvedLeaveHours: 1, leaveBalanceHours: 10 });
    expect(r.shortfall).toBe(4);
    expect(r.leaveApplied).toBe(1);
    expect(r.unpaidShortfall).toBe(3);
  });

  // ─── Ph-197: payroll export ───────────────────────────────────────

  it('payrollExport — aggregates elements across employees', async () => {
    resultRepo.find.mockResolvedValue([
      { employeeId: 'e1', regularHours: 40, overtimeHours: 5, premiumHours: 0, elements: [{ code: 'REG', hours: 40, multiplier: 1 }, { code: 'OT', hours: 5, multiplier: 1.5 }] },
      { employeeId: 'e2', regularHours: 38, overtimeHours: 0, premiumHours: 0, elements: [{ code: 'REG', hours: 38, multiplier: 1 }] },
    ]);
    const r = await service.payrollExport('t1', '2026-06-01', '2026-06-30');
    expect(r.employees).toBe(2);
    const reg = r.elements.find((e: any) => e.code === 'REG');
    expect(reg.hours).toBe(78);
    const ot = r.elements.find((e: any) => e.code === 'OT');
    expect(ot.hours).toBe(5);
  });
});
