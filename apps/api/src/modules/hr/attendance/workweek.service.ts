import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  BreakRule, BreakType, AttendanceInfraction, InfractionType, InfractionStatus, FairWorkweekRule,
} from './entities/workweek.entity';
import { AutomationService } from '../../automation/automation.service';

// Default point weights per infraction type.
const DEFAULT_POINTS: Record<InfractionType, number> = {
  [InfractionType.LATE]: 1,
  [InfractionType.EARLY_LEAVE]: 1,
  [InfractionType.MISSED_PUNCH]: 1,
  [InfractionType.MISSED_BREAK]: 2,
  [InfractionType.LONG_BREAK]: 1,
  [InfractionType.NO_SHOW]: 4,
};

const ESCALATION_THRESHOLD = 6; // points within the window that trigger escalation

@Injectable()
export class WorkweekService {
  constructor(
    @InjectRepository(BreakRule) private readonly breakRepo: Repository<BreakRule>,
    @InjectRepository(AttendanceInfraction) private readonly infractionRepo: Repository<AttendanceInfraction>,
    @InjectRepository(FairWorkweekRule) private readonly fwwRepo: Repository<FairWorkweekRule>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Break rules ──────────────────────────────────────────────

  async createBreakRule(tenantId: string, dto: { name: string; type?: BreakType; minWorkMinutes: number; breakMinutes: number; paid?: boolean }): Promise<BreakRule> {
    if (!dto.name?.trim() || !(dto.minWorkMinutes > 0) || !(dto.breakMinutes > 0)) {
      throw new BadRequestException('name, positive minWorkMinutes and breakMinutes are required');
    }
    return this.breakRepo.save(this.breakRepo.create({
      tenantId, name: dto.name.trim(), type: dto.type ?? BreakType.MEAL,
      minWorkMinutes: dto.minWorkMinutes, breakMinutes: dto.breakMinutes, paid: dto.paid ?? false, active: true,
    }));
  }

  listBreakRules(tenantId: string): Promise<BreakRule[]> {
    return this.breakRepo.find({ where: { tenantId, active: true }, order: { minWorkMinutes: 'ASC' } });
  }

  /**
   * Evaluate breaks for a worked shift: for every active rule the shift's work
   * time triggers, compare required vs actually-taken break minutes and report
   * shortfalls (a MISSED_BREAK violation).
   */
  async evaluateBreaks(tenantId: string, workedMinutes: number, breakMinutesTaken: number): Promise<{
    requiredMinutes: number; takenMinutes: number; violations: Array<{ rule: string; type: BreakType; shortfall: number }>;
  }> {
    const rules = await this.listBreakRules(tenantId);
    const triggered = rules.filter((r) => workedMinutes >= r.minWorkMinutes);
    const requiredMinutes = triggered.reduce((s, r) => s + r.breakMinutes, 0);
    const violations: Array<{ rule: string; type: BreakType; shortfall: number }> = [];
    // Attribute taken break time greedily against the triggered rules (largest first).
    let remaining = breakMinutesTaken;
    for (const r of [...triggered].sort((a, b) => b.breakMinutes - a.breakMinutes)) {
      const covered = Math.min(remaining, r.breakMinutes);
      remaining -= covered;
      if (covered < r.breakMinutes) violations.push({ rule: r.name, type: r.type, shortfall: r.breakMinutes - covered });
    }
    return { requiredMinutes, takenMinutes: breakMinutesTaken, violations };
  }

  // ─── Infractions ──────────────────────────────────────────────

  async recordInfraction(tenantId: string, dto: { employeeId: string; date: string; type: InfractionType; points?: number; note?: string }): Promise<AttendanceInfraction> {
    if (!dto.employeeId || !dto.date) throw new BadRequestException('employeeId and date are required');
    if (!Object.values(InfractionType).includes(dto.type)) throw new BadRequestException('A valid infraction type is required');
    const points = dto.points != null ? Number(dto.points) : DEFAULT_POINTS[dto.type];
    const infraction = await this.infractionRepo.save(this.infractionRepo.create({
      tenantId, employeeId: dto.employeeId, date: dto.date, type: dto.type, points, status: InfractionStatus.OPEN, note: dto.note ?? null,
    }));
    await this.automation?.emit(tenantId, 'attendance.infraction_recorded', {
      infractionId: infraction.id, employeeId: dto.employeeId, type: dto.type, points,
    });
    return infraction;
  }

  listInfractions(tenantId: string, employeeId: string): Promise<AttendanceInfraction[]> {
    return this.infractionRepo.find({ where: { tenantId, employeeId }, order: { date: 'DESC' } });
  }

  async waiveInfraction(tenantId: string, id: string): Promise<AttendanceInfraction> {
    const inf = await this.infractionRepo.findOne({ where: { id, tenantId } });
    if (!inf) throw new NotFoundException(`Infraction ${id} not found`);
    inf.status = InfractionStatus.WAIVED;
    return this.infractionRepo.save(inf);
  }

  /** Active (non-waived) point total for an employee over a date window. */
  async pointsInWindow(tenantId: string, employeeId: string, fromDate: string, toDate: string): Promise<{ points: number; escalate: boolean; count: number }> {
    const rows = (await this.infractionRepo.find({ where: { tenantId, employeeId, date: Between(fromDate, toDate) } }))
      .filter((r) => r.status !== InfractionStatus.WAIVED);
    const points = rows.reduce((s, r) => s + Number(r.points), 0);
    return { points, escalate: points >= ESCALATION_THRESHOLD, count: rows.length };
  }

  // ─── Fair workweek ────────────────────────────────────────────

  async createFairWorkweekRule(tenantId: string, dto: { name: string; advanceNoticeDays?: number; minRestHoursBetweenShifts?: number; predictabilityPayHours?: number }): Promise<FairWorkweekRule> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.fwwRepo.save(this.fwwRepo.create({
      tenantId, name: dto.name.trim(),
      advanceNoticeDays: dto.advanceNoticeDays ?? 14,
      minRestHoursBetweenShifts: dto.minRestHoursBetweenShifts ?? 11,
      predictabilityPayHours: dto.predictabilityPayHours ?? 1, active: true,
    }));
  }

  async getActiveRule(tenantId: string): Promise<FairWorkweekRule | null> {
    return this.fwwRepo.findOne({ where: { tenantId, active: true } });
  }

  /**
   * Check a shift pair for a clopening violation (too little rest between the
   * end of one shift and the start of the next). Returns owed predictability
   * pay when violated.
   */
  async checkClopening(tenantId: string, prevShiftEndIso: string, nextShiftStartIso: string): Promise<{ restHours: number; violation: boolean; predictabilityPayHours: number }> {
    const rule = await this.getActiveRule(tenantId);
    const restHours = (Date.parse(nextShiftStartIso) - Date.parse(prevShiftEndIso)) / 3600000;
    const minRest = rule?.minRestHoursBetweenShifts ?? 11;
    const violation = restHours < minRest;
    if (violation) {
      await this.automation?.emit(tenantId, 'attendance.fairworkweek_violation', { kind: 'CLOPENING', restHours: Math.round(restHours * 10) / 10, minRest });
    }
    return { restHours: Math.round(restHours * 10) / 10, violation, predictabilityPayHours: violation ? (rule?.predictabilityPayHours ?? 1) : 0 };
  }

  /** Check whether a schedule was posted with enough advance notice. */
  async checkAdvanceNotice(tenantId: string, postedDate: string, shiftStartDate: string): Promise<{ noticeDays: number; violation: boolean }> {
    const rule = await this.getActiveRule(tenantId);
    const noticeDays = Math.floor((Date.parse(shiftStartDate) - Date.parse(postedDate)) / 86400000);
    const required = rule?.advanceNoticeDays ?? 14;
    return { noticeDays, violation: noticeDays < required };
  }

  // ─── One View ─────────────────────────────────────────────────

  /**
   * Unified daily view for an employee: scheduled vs actual with derived
   * exceptions (late in, early out, missed break) and same-day infractions.
   */
  async oneView(tenantId: string, employeeId: string, date: string, day: {
    scheduledStart?: string; scheduledEnd?: string; actualStart?: string; actualEnd?: string;
    breakMinutesTaken?: number; graceMinutes?: number;
  }): Promise<any> {
    const grace = day.graceMinutes ?? 5;
    const exceptions: string[] = [];
    const minsBetween = (a?: string, b?: string) => (a && b ? (Date.parse(b) - Date.parse(a)) / 60000 : null);

    const lateBy = minsBetween(day.scheduledStart, day.actualStart);
    if (lateBy != null && lateBy > grace) exceptions.push(`LATE_IN(${Math.round(lateBy)}m)`);
    const earlyBy = minsBetween(day.actualEnd, day.scheduledEnd);
    if (earlyBy != null && earlyBy > grace) exceptions.push(`EARLY_OUT(${Math.round(earlyBy)}m)`);
    if (day.scheduledStart && !day.actualStart) exceptions.push('MISSED_PUNCH');

    const workedMinutes = minsBetween(day.actualStart, day.actualEnd);
    let breakEval: any = null;
    if (workedMinutes != null) {
      breakEval = await this.evaluateBreaks(tenantId, workedMinutes, day.breakMinutesTaken ?? 0);
      if (breakEval.violations.length) exceptions.push('MISSED_BREAK');
    }

    const infractions = await this.infractionRepo.find({ where: { tenantId, employeeId, date } });
    return {
      employeeId, date,
      scheduled: { start: day.scheduledStart ?? null, end: day.scheduledEnd ?? null },
      actual: { start: day.actualStart ?? null, end: day.actualEnd ?? null, workedMinutes: workedMinutes != null ? Math.round(workedMinutes) : null, breakMinutesTaken: day.breakMinutesTaken ?? 0 },
      breaks: breakEval,
      exceptions,
      infractions,
    };
  }
}
