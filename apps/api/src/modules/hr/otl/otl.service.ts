import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { OtlTimeRule, OtlRuleType, ShiftCondition } from './entities/otl-time-rule.entity';
import { OtlTimecardResult } from './entities/otl-timecard-result.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface DayInput {
  date: string;
  hours: number;
  isNight?: boolean;
  isWeekend?: boolean;
  isHoliday?: boolean;
  worked?: boolean; // defaults true when hours > 0
}

/** Defaults applied when no matching rule is configured (US FLSA-ish). */
const DEFAULTS = {
  dailyThreshold: 8,
  weeklyThreshold: 40,
  otMultiplier: 1.5,
  seventhDayMultiplier: 2,
  nightPremiumPct: 15,
  weekendPremiumPct: 10,
};

@Injectable()
export class OtlService {
  constructor(
    @InjectRepository(OtlTimeRule) private readonly ruleRepo: Repository<OtlTimeRule>,
    @InjectRepository(OtlTimecardResult) private readonly resultRepo: Repository<OtlTimecardResult>,
  ) {}

  // ─── Ph-194: time calculation rules ───────────────────────────────

  listRules(tenantId: string): Promise<OtlTimeRule[]> {
    return this.ruleRepo.find({ where: { tenantId }, order: { ruleType: 'ASC' } });
  }

  async createRule(tenantId: string, data: Partial<OtlTimeRule>): Promise<OtlTimeRule> {
    if (!data.name?.trim()) throw new BadRequestException('name is required');
    if (!data.ruleType) throw new BadRequestException('ruleType is required');
    const r = this.ruleRepo.create({
      tenantId, name: data.name, ruleType: data.ruleType,
      thresholdHours: data.thresholdHours ?? 0, payMultiplier: data.payMultiplier ?? 1,
      premiumPct: data.premiumPct ?? 0, shiftCondition: data.shiftCondition ?? null,
      payElementCode: data.payElementCode ?? 'OT', isActive: data.isActive ?? true,
    } as any) as unknown as OtlTimeRule;
    return (this.ruleRepo.save(r) as unknown) as Promise<OtlTimeRule>;
  }

  async seedDefaults(tenantId: string): Promise<OtlTimeRule[]> {
    const existing = await this.ruleRepo.count({ where: { tenantId } });
    if (existing > 0) throw new BadRequestException('Rules already exist for this tenant');
    const defs: Partial<OtlTimeRule>[] = [
      { name: 'Daily Overtime (>8h)', ruleType: OtlRuleType.DAILY_OT, thresholdHours: 8, payMultiplier: 1.5, payElementCode: 'OT' },
      { name: 'Weekly Overtime (>40h)', ruleType: OtlRuleType.WEEKLY_OT, thresholdHours: 40, payMultiplier: 1.5, payElementCode: 'OT' },
      { name: '7th Consecutive Day', ruleType: OtlRuleType.SEVENTH_DAY, payMultiplier: 2, payElementCode: 'OT2' },
      { name: 'Night Differential', ruleType: OtlRuleType.SHIFT_DIFFERENTIAL, shiftCondition: ShiftCondition.NIGHT, premiumPct: 15, payElementCode: 'DIFF_NIGHT' },
      { name: 'Weekend Differential', ruleType: OtlRuleType.SHIFT_DIFFERENTIAL, shiftCondition: ShiftCondition.WEEKEND, premiumPct: 10, payElementCode: 'DIFF_WKND' },
    ];
    const saved: OtlTimeRule[] = [];
    for (const d of defs) saved.push(await this.createRule(tenantId, d));
    return saved;
  }

  // ─── Ph-194/195: timecard processing ──────────────────────────────

  /**
   * Process a weekly timecard: apply daily OT, weekly OT, 7th-consecutive-day
   * premium, and shift differentials. Persists and returns a payroll-ready
   * breakdown by pay element.
   */
  async processTimecard(tenantId: string, employeeId: string, periodStart: string, days: DayInput[]): Promise<OtlTimecardResult> {
    if (!days?.length) throw new BadRequestException('days are required');
    const rules = await this.ruleRepo.find({ where: { tenantId, isActive: true } });
    const ruleOf = (t: OtlRuleType, cond?: ShiftCondition) =>
      rules.find((r) => r.ruleType === t && (cond ? r.shiftCondition === cond : true));

    const dailyRule = ruleOf(OtlRuleType.DAILY_OT);
    const weeklyRule = ruleOf(OtlRuleType.WEEKLY_OT);
    const seventhRule = ruleOf(OtlRuleType.SEVENTH_DAY);
    const nightRule = ruleOf(OtlRuleType.SHIFT_DIFFERENTIAL, ShiftCondition.NIGHT);
    const weekendRule = ruleOf(OtlRuleType.SHIFT_DIFFERENTIAL, ShiftCondition.WEEKEND);

    const dailyThreshold = dailyRule ? Number(dailyRule.thresholdHours) : DEFAULTS.dailyThreshold;
    const weeklyThreshold = weeklyRule ? Number(weeklyRule.thresholdHours) : DEFAULTS.weeklyThreshold;
    const otMultiplier = dailyRule ? Number(dailyRule.payMultiplier) : DEFAULTS.otMultiplier;
    const seventhMultiplier = seventhRule ? Number(seventhRule.payMultiplier) : DEFAULTS.seventhDayMultiplier;
    const nightPct = nightRule ? Number(nightRule.premiumPct) : DEFAULTS.nightPremiumPct;
    const weekendPct = weekendRule ? Number(weekendRule.premiumPct) : DEFAULTS.weekendPremiumPct;

    let regular = 0;
    let overtime = 0;
    let seventhDay = 0;
    let nightHours = 0;
    let weekendHours = 0;
    let consecutive = 0;

    const ordered = [...days].sort((a, b) => a.date.localeCompare(b.date));
    for (const d of ordered) {
      const worked = d.worked ?? d.hours > 0;
      if (worked) consecutive++; else { consecutive = 0; continue; }

      const hrs = Math.max(0, Number(d.hours) || 0);
      // 7th consecutive worked day: all its hours are premium, not regular/OT.
      if (consecutive >= 7) {
        seventhDay += hrs;
      } else {
        const dailyOt = Math.max(0, hrs - dailyThreshold);
        overtime += dailyOt;
        regular += hrs - dailyOt;
      }
      // Differentials apply to all worked hours under that condition.
      if (d.isNight) nightHours += hrs;
      if (d.isWeekend) weekendHours += hrs;
    }

    // Weekly OT: regular hours above the weekly threshold roll into OT.
    const weeklyExcess = Math.max(0, regular - weeklyThreshold);
    if (weeklyExcess > 0) {
      regular -= weeklyExcess;
      overtime += weeklyExcess;
    }

    regular = round2(regular);
    overtime = round2(overtime);
    seventhDay = round2(seventhDay);

    const elements: Array<{ code: string; hours: number; multiplier: number }> = [
      { code: 'REG', hours: regular, multiplier: 1 },
    ];
    if (overtime > 0) elements.push({ code: dailyRule?.payElementCode ?? 'OT', hours: overtime, multiplier: otMultiplier });
    if (seventhDay > 0) elements.push({ code: seventhRule?.payElementCode ?? 'OT2', hours: seventhDay, multiplier: seventhMultiplier });
    if (nightHours > 0) elements.push({ code: nightRule?.payElementCode ?? 'DIFF_NIGHT', hours: round2(nightHours), multiplier: round2(nightPct / 100) });
    if (weekendHours > 0) elements.push({ code: weekendRule?.payElementCode ?? 'DIFF_WKND', hours: round2(weekendHours), multiplier: round2(weekendPct / 100) });

    const periodEnd = ordered[ordered.length - 1].date;
    let result = await this.resultRepo.findOne({ where: { tenantId, employeeId, periodStart } });
    if (!result) {
      result = this.resultRepo.create({ tenantId, employeeId, periodStart } as any) as unknown as OtlTimecardResult;
    }
    result.periodEnd = periodEnd;
    result.regularHours = regular;
    result.overtimeHours = overtime;
    result.premiumHours = seventhDay;
    result.elements = elements;
    result.status = 'PROCESSED';
    return (this.resultRepo.save(result) as unknown) as Promise<OtlTimecardResult>;
  }

  // ─── Ph-196: absence integration ──────────────────────────────────

  /**
   * Reconcile a timesheet against the schedule: when worked hours fall below
   * scheduled, approved leave covers the shortfall (deducted from balance) and
   * any remainder is unpaid.
   */
  reconcileAbsence(input: { scheduledHours: number; workedHours: number; approvedLeaveHours?: number; leaveBalanceHours?: number }): any {
    const scheduled = Math.max(0, Number(input.scheduledHours) || 0);
    const worked = Math.max(0, Number(input.workedHours) || 0);
    const approvedLeave = Math.max(0, Number(input.approvedLeaveHours) || 0);
    const balance = input.leaveBalanceHours != null ? Math.max(0, Number(input.leaveBalanceHours)) : Infinity;
    const shortfall = Math.max(0, scheduled - worked);
    const leaveApplied = round2(Math.min(shortfall, approvedLeave, balance));
    const unpaidShortfall = round2(Math.max(0, shortfall - leaveApplied));
    return {
      scheduledHours: round2(scheduled), workedHours: round2(worked), shortfall: round2(shortfall),
      leaveApplied, unpaidShortfall,
      newLeaveBalance: balance === Infinity ? null : round2(balance - leaveApplied),
      paidHours: round2(worked + leaveApplied),
    };
  }

  // ─── Ph-197: payroll-ready time ───────────────────────────────────

  /**
   * Aggregate processed timecards in a date range into payroll input grouped by
   * pay element (regular, OT, differentials).
   */
  async payrollExport(tenantId: string, periodStart: string, periodEnd: string): Promise<any> {
    const results = await this.resultRepo.find({ where: { tenantId, periodStart: Between(periodStart, periodEnd) } });
    const byElement = new Map<string, { code: string; hours: number; multiplier: number }>();
    for (const r of results) {
      for (const e of r.elements ?? []) {
        const cur = byElement.get(e.code) ?? { code: e.code, hours: 0, multiplier: e.multiplier };
        cur.hours = round2(cur.hours + Number(e.hours));
        byElement.set(e.code, cur);
      }
    }
    return {
      periodStart, periodEnd, employees: results.length,
      elements: Array.from(byElement.values()).sort((a, b) => a.code.localeCompare(b.code)),
      lines: results.map((r) => ({ employeeId: r.employeeId, regularHours: r.regularHours, overtimeHours: r.overtimeHours, premiumHours: r.premiumHours, elements: r.elements })),
    };
  }

  async getResult(tenantId: string, employeeId: string, periodStart: string): Promise<OtlTimecardResult> {
    const r = await this.resultRepo.findOne({ where: { tenantId, employeeId, periodStart } });
    if (!r) throw new NotFoundException('Timecard result not found');
    return r;
  }
}
