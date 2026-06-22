import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TimeEvaluationRule } from './entities/time-evaluation-rule.entity';
import { TimeEvaluationResult } from './entities/time-evaluation-result.entity';
import { AttendanceRecord } from './entities/attendance-record.entity';
import { Shift } from './entities/shift.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Employee } from '../employees/entities/employee.entity';

function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function dateToMinutes(d: Date | null): number | null {
  if (!d) return null;
  const dt = new Date(d);
  return dt.getHours() * 60 + dt.getMinutes();
}

function dateToHHMM(d: Date | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

// Derive a shift's working duration: prefer explicit working_minutes,
// else compute from start/end (handling overnight shifts), minus breaks.
function shiftDurationMinutes(shift: Shift): number {
  if (shift.workingMinutes && shift.workingMinutes > 0) return shift.workingMinutes;
  let start = hhmmToMinutes(shift.startTime);
  let end = hhmmToMinutes(shift.endTime);
  if (end <= start) end += 24 * 60; // overnight
  return Math.max(0, end - start - (shift.breakMinutes ?? 0));
}

@Injectable()
export class TimeEvaluationService {
  constructor(
    @InjectRepository(TimeEvaluationRule) private readonly rulesRepo: Repository<TimeEvaluationRule>,
    @InjectRepository(TimeEvaluationResult) private readonly resultsRepo: Repository<TimeEvaluationResult>,
    @InjectRepository(AttendanceRecord) private readonly attendanceRepo: Repository<AttendanceRecord>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(ShiftAssignment) private readonly shiftAssignRepo: Repository<ShiftAssignment>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
  ) {}

  async runEvaluation(tenantId: string, month: number, year: number, employeeIds?: string[]) {
    const rules = await this.rulesRepo.find({ where: { tenantId, isActive: true } });

    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const whereClause: any = { tenantId, date: Between(fromDate, toDate) };
    const attendance = await this.attendanceRepo.find({ where: whereClause });

    const filteredAttendance = employeeIds?.length
      ? attendance.filter(a => employeeIds.includes(a.employeeId))
      : attendance;

    // Fetch shifts
    const shifts = await this.shiftRepo.find({ where: { tenantId } });
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    const defaultShift = shifts.find(s => s.isActive) ?? shifts[0] ?? null;

    // Map employee -> assigned shift (latest assignment wins)
    const assignments = await this.shiftAssignRepo.find({ where: { tenantId } });
    const empShiftMap = new Map<string, string>();
    for (const a of assignments) empShiftMap.set(a.employeeId, a.shiftId);

    const lateRule = rules.find(r => r.type === 'LATE_ARRIVAL');
    const otRule = rules.find(r => r.type === 'OVERTIME');

    const results: TimeEvaluationResult[] = [];
    let totalAbsent = 0;
    let totalLopDays = 0;
    let totalOtMinutes = 0;

    for (const record of filteredAttendance) {
      const shiftId = empShiftMap.get(record.employeeId) ?? defaultShift?.id ?? null;
      const shift = shiftId ? shiftMap.get(shiftId) ?? null : null;

      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let workingMinutes = 0;
      let overtimeMinutes = 0;
      let isAbsent = false;
      let isHalfDay = false;
      let lopDays = 0;
      let compOffEarned = 0;

      if (!record.checkIn) {
        isAbsent = true;
        lopDays = 1;
        totalAbsent++;
        totalLopDays += 1;
      } else {
        const checkInMin = dateToMinutes(record.checkIn);
        const checkOutMin = dateToMinutes(record.checkOut);
        if (checkInMin !== null && checkOutMin !== null) {
          let effectiveOut = checkOutMin;
          if (effectiveOut < checkInMin) effectiveOut += 24 * 60; // overnight
          workingMinutes = record.workingMinutes ?? Math.max(0, effectiveOut - checkInMin);

          if (shift) {
            const shiftStartMin = hhmmToMinutes(shift.startTime);
            const shiftEndMin = hhmmToMinutes(shift.endTime);
            const graceMin = lateRule?.graceMinutes ?? shift.graceMinutesLate ?? 0;
            const duration = shiftDurationMinutes(shift);

            // Late arrival
            if (checkInMin > shiftStartMin + graceMin) {
              lateMinutes = checkInMin - shiftStartMin;
            }

            // Early departure
            if (checkOutMin < shiftEndMin) {
              earlyDepartureMinutes = shiftEndMin - checkOutMin;
            }

            // Overtime
            if (duration && workingMinutes > duration) {
              const otThreshold = otRule?.thresholdMinutes ?? 30;
              const excess = workingMinutes - duration;
              if (excess >= otThreshold) {
                overtimeMinutes = excess;
                totalOtMinutes += excess;
                if (otRule?.compOffEnabled) {
                  compOffEarned = Math.round((excess / 60) * 10) / 10;
                }
              }
            }

            // Half day check
            if (duration && workingMinutes < duration / 2) {
              isHalfDay = true;
              lopDays = 0.5;
              totalLopDays += 0.5;
            }
          }
        }
      }

      // Upsert result
      let result = await this.resultsRepo.findOne({
        where: { tenantId, employeeId: record.employeeId, date: record.date },
      });

      if (!result) {
        result = this.resultsRepo.create({ tenantId, employeeId: record.employeeId, date: record.date });
      }

      result.shiftId = shiftId || null;
      result.checkIn = dateToHHMM(record.checkIn);
      result.checkOut = dateToHHMM(record.checkOut);
      result.workingMinutes = workingMinutes;
      result.lateMinutes = lateMinutes;
      result.earlyDepartureMinutes = earlyDepartureMinutes;
      result.overtimeMinutes = overtimeMinutes;
      result.isAbsent = isAbsent;
      result.isHalfDay = isHalfDay;
      result.lopDays = lopDays;
      result.compOffEarned = compOffEarned;
      result.status = 'EVALUATED';

      results.push(await this.resultsRepo.save(result));
    }

    return {
      totalEvaluated: results.length,
      totalAbsent,
      totalLopDays,
      totalOtHours: Math.round((totalOtMinutes / 60) * 10) / 10,
    };
  }

  async getMonthlyReport(tenantId: string, month: number, year: number) {
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const results = await this.resultsRepo.find({
      where: { tenantId, date: Between(fromDate, toDate) },
      order: { employeeId: 'ASC', date: 'ASC' },
    });

    const employees = await this.employeeRepo.find({ where: { tenantId } });
    const employeeMap = new Map(employees.map(e => [e.id, e]));

    const byEmployee = new Map<string, any>();
    for (const r of results) {
      if (!byEmployee.has(r.employeeId)) {
        const emp = employeeMap.get(r.employeeId);
        byEmployee.set(r.employeeId, {
          employeeId: r.employeeId,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId,
          daysWorked: 0,
          totalWorkingMinutes: 0,
          lateDays: 0,
          overtimeMinutes: 0,
          absentDays: 0,
          lopDays: 0,
        });
      }
      const agg = byEmployee.get(r.employeeId);
      if (!r.isAbsent) agg.daysWorked++;
      agg.totalWorkingMinutes += r.workingMinutes;
      if (r.lateMinutes > 0) agg.lateDays++;
      agg.overtimeMinutes += r.overtimeMinutes;
      if (r.isAbsent) agg.absentDays++;
      agg.lopDays += Number(r.lopDays);
    }

    return Array.from(byEmployee.values()).map(e => ({
      ...e,
      totalWorkingHours: Math.round((e.totalWorkingMinutes / 60) * 10) / 10,
      overtimeHours: Math.round((e.overtimeMinutes / 60) * 10) / 10,
    }));
  }

  async getEmployeeTimecard(tenantId: string, employeeId: string, month: number, year: number) {
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    return this.resultsRepo.find({
      where: { tenantId, employeeId, date: Between(fromDate, toDate) },
      order: { date: 'ASC' },
    });
  }

  async getRules(tenantId: string): Promise<TimeEvaluationRule[]> {
    return this.rulesRepo.find({ where: { tenantId } });
  }

  async saveRules(tenantId: string, rules: Partial<TimeEvaluationRule>[]): Promise<TimeEvaluationRule[]> {
    const saved: TimeEvaluationRule[] = [];
    for (const ruleDto of rules) {
      if (ruleDto.id) {
        const existing = await this.rulesRepo.findOne({ where: { id: ruleDto.id, tenantId } });
        if (existing) {
          Object.assign(existing, ruleDto, { tenantId });
          saved.push(await this.rulesRepo.save(existing));
          continue;
        }
      }
      const rule = this.rulesRepo.create({ ...ruleDto, tenantId });
      saved.push(await this.rulesRepo.save(rule));
    }
    return saved;
  }
}
