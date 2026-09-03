import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ShiftPattern } from './entities/shift-pattern.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Geofence } from './entities/geofence.entity';
import { AttendanceRecord, AttendanceStatus } from './entities/attendance-record.entity';

const OFF = 'OFF';

/**
 * Time-tracking policy depth: weekly shift patterns that generate rosters,
 * geofence/IP validation for check-ins, and an absconding sweep. Kept
 * separate from the core AttendanceService so the base flows are untouched.
 */
@Injectable()
export class TimePolicyService {
  constructor(
    @InjectRepository(ShiftPattern) private readonly patternRepo: Repository<ShiftPattern>,
    @InjectRepository(ShiftAssignment) private readonly assignmentRepo: Repository<ShiftAssignment>,
    @InjectRepository(Geofence) private readonly geofenceRepo: Repository<Geofence>,
    @InjectRepository(AttendanceRecord) private readonly attendanceRepo: Repository<AttendanceRecord>,
  ) {}

  // ---- Shift patterns ----
  async createPattern(tenantId: string, dto: Partial<ShiftPattern>): Promise<ShiftPattern> {
    if (!dto.name?.trim()) throw new BadRequestException('Pattern name is required');
    if (!Array.isArray(dto.weekSlots) || dto.weekSlots.length !== 7) {
      throw new BadRequestException('weekSlots must have exactly 7 entries (Monday-first)');
    }
    return this.patternRepo.save(this.patternRepo.create({ ...dto, tenantId }));
  }

  async listPatterns(tenantId: string): Promise<ShiftPattern[]> {
    return this.patternRepo.find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  /** Monday-index (0=Mon … 6=Sun) of a yyyy-mm-dd date. */
  private mondayIndex(dateStr: string): number {
    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay(); // 0=Sun
    return (dow + 6) % 7;
  }

  /** ISO week number for rotation offset. */
  private isoWeek(dateStr: string): number {
    const d = new Date(dateStr + 'T00:00:00Z');
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  }

  /**
   * Generate per-day shift assignments for a set of employees over a date
   * range from a pattern. Rest/off slots produce no assignment. Rotating
   * patterns advance the start slot by the ISO week number.
   */
  async generateAssignments(
    tenantId: string, patternId: string,
    dto: { employeeIds: string[]; from: string; to: string },
  ): Promise<{ created: number; skippedRestDays: number }> {
    const pattern = await this.patternRepo.findOne({ where: { id: patternId, tenantId } });
    if (!pattern) throw new NotFoundException(`Shift pattern ${patternId} not found`);
    const employeeIds = [...new Set((dto.employeeIds ?? []).filter(Boolean))];
    if (!employeeIds.length) throw new BadRequestException('At least one employeeId is required');
    if (!dto.from || !dto.to || dto.to < dto.from) throw new BadRequestException('A valid from/to range is required');

    const start = new Date(dto.from + 'T00:00:00Z');
    const end = new Date(dto.to + 'T00:00:00Z');
    const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (spanDays > 366) throw new BadRequestException('Range cannot exceed one year');

    let created = 0;
    let skippedRestDays = 0;
    const toCreate: ShiftAssignment[] = [];
    for (let i = 0; i < spanDays; i++) {
      const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      let slot = this.mondayIndex(day);
      if (pattern.rotating) slot = (slot + this.isoWeek(day)) % 7;
      const shiftId = pattern.weekSlots[slot];
      if (!shiftId || shiftId === OFF) { skippedRestDays += employeeIds.length; continue; }
      for (const employeeId of employeeIds) {
        toCreate.push(this.assignmentRepo.create({
          tenantId, employeeId, shiftId, effectiveFrom: day, effectiveTo: day,
        }));
        created += 1;
      }
    }
    if (toCreate.length) await this.assignmentRepo.save(toCreate);
    return { created, skippedRestDays };
  }

  // ---- Geofencing ----
  async createGeofence(tenantId: string, dto: Partial<Geofence>): Promise<Geofence> {
    if (!dto.name?.trim() || dto.lat == null || dto.lng == null) {
      throw new BadRequestException('name, lat and lng are required');
    }
    return this.geofenceRepo.save(this.geofenceRepo.create({ ...dto, tenantId }));
  }

  async listGeofences(tenantId: string): Promise<Geofence[]> {
    return this.geofenceRepo.find({ where: { tenantId, isActive: true }, order: { name: 'ASC' } });
  }

  /** Great-circle distance between two coordinates, in metres. */
  static haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Validate a check-in against active geofences. Passes if it falls inside
   * any active fence (and, for IP-restricted fences, from an allowed IP).
   * With no fences configured, all check-ins pass.
   */
  async validateCheckin(
    tenantId: string, ctx: { lat?: number; lng?: number; ip?: string },
  ): Promise<{ allowed: boolean; fenceId?: string; reason?: string }> {
    const fences = await this.geofenceRepo.find({ where: { tenantId, isActive: true } });
    if (!fences.length) return { allowed: true };
    if (ctx.lat == null || ctx.lng == null) {
      return { allowed: false, reason: 'Location is required for geofenced check-in' };
    }
    for (const fence of fences) {
      const dist = TimePolicyService.haversineMeters(ctx.lat, ctx.lng, Number(fence.lat), Number(fence.lng));
      if (dist > fence.radiusMeters) continue;
      if (fence.allowedIps?.length && (!ctx.ip || !fence.allowedIps.includes(ctx.ip))) {
        return { allowed: false, fenceId: fence.id, reason: 'Check-in IP is not allowed for this location' };
      }
      return { allowed: true, fenceId: fence.id };
    }
    return { allowed: false, reason: 'Check-in location is outside every allowed geofence' };
  }

  // ---- Absconding sweep ----
  /**
   * Flag employees with `threshold`+ consecutive ABSENT days ending on or
   * before `asOf` (weekends/holidays/leave break the streak). Returns one
   * row per absconding employee with the streak start and length.
   */
  async abscondingSweep(
    tenantId: string, opts: { asOf?: string; threshold?: number; lookbackDays?: number } = {},
  ): Promise<Array<{ employeeId: string; consecutiveAbsent: number; since: string }>> {
    const threshold = opts.threshold ?? 3;
    const lookback = opts.lookbackDays ?? 30;
    const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
    const from = new Date(new Date(asOf + 'T00:00:00Z').getTime() - lookback * 86_400_000).toISOString().slice(0, 10);

    const records = await this.attendanceRepo.find({
      where: { tenantId, date: Between(from, asOf) },
      order: { date: 'ASC' },
    });
    const byEmployee = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      const list = byEmployee.get(r.employeeId) ?? [];
      list.push(r);
      byEmployee.set(r.employeeId, list);
    }

    const flagged: Array<{ employeeId: string; consecutiveAbsent: number; since: string }> = [];
    for (const [employeeId, rows] of byEmployee) {
      // Walk backwards from the latest record counting consecutive ABSENTs.
      let streak = 0;
      let since = '';
      for (let i = rows.length - 1; i >= 0; i--) {
        const status = rows[i].status;
        if (status === AttendanceStatus.ABSENT) {
          streak += 1;
          since = rows[i].date;
        } else if (status === AttendanceStatus.PRESENT || status === AttendanceStatus.HALF_DAY) {
          break; // an actual working day ends the streak
        }
        // WEEKEND / HOLIDAY / LEAVE neither extend nor break — skip.
      }
      if (streak >= threshold) flagged.push({ employeeId, consecutiveAbsent: streak, since });
    }
    return flagged.sort((a, b) => b.consecutiveAbsent - a.consecutiveAbsent);
  }
}
