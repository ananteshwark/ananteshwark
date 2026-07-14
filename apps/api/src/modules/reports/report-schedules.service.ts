import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { EmailService } from '../email/email.service';
import { ReportsService, ReportFilter } from './reports.service';
import { REPORT_BY_CODE } from './report-catalog';
import { ReportSchedule, ReportCadence } from './entities/report-schedule.entity';
import { ReportView } from './entities/report-view.entity';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ScheduleRunResult {
  scheduleId: string;
  tenantId: string;
  reportCode: string;
  name: string;
  status: 'SENT' | 'FAILED';
  recipients: number;
  error?: string;
}

/**
 * Cadenced report delivery. Schedules are executed by the hourly automation
 * sweep: each due schedule runs its report AS ITS CREATOR (so their
 * permissions apply — a creator who loses access stops the delivery), emails
 * the CSV to the recipients, and rolls nextRunAt forward (the dedupe). A
 * schedule may pin a saved view — edits to the view flow through — or carry
 * inline filters validated at save time.
 */
@Injectable()
export class ReportSchedulesService {
  private readonly logger = new Logger(ReportSchedulesService.name);

  constructor(
    private readonly reports: ReportsService,
    @InjectRepository(ReportSchedule)
    private readonly scheduleRepo: Repository<ReportSchedule>,
    @InjectRepository(ReportView)
    private readonly viewRepo: Repository<ReportView>,
    @Optional() private readonly email?: EmailService,
  ) {}

  /** Next occurrence strictly after `from`, in UTC. */
  static nextRun(
    s: { cadence: ReportCadence; dayOfWeek?: number | null; dayOfMonth?: number | null; hourUtc?: number | null },
    from: Date,
  ): Date {
    const hour = s.hourUtc ?? 6;
    if (s.cadence === ReportCadence.DAILY) {
      const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hour));
      if (candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);
      return candidate;
    }
    if (s.cadence === ReportCadence.WEEKLY) {
      const dow = s.dayOfWeek ?? 1; // Monday
      const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hour));
      while (candidate.getUTCDay() !== dow || candidate <= from) candidate.setUTCDate(candidate.getUTCDate() + 1);
      return candidate;
    }
    // MONTHLY — clamp the requested day to each month's length.
    const dom = s.dayOfMonth ?? 1;
    const monthly = (year: number, month0: number) => {
      const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
      return new Date(Date.UTC(year, month0, Math.min(dom, last), hour));
    };
    let candidate = monthly(from.getUTCFullYear(), from.getUTCMonth());
    if (candidate <= from) candidate = monthly(from.getUTCFullYear(), from.getUTCMonth() + 1);
    return candidate;
  }

  private validateCadence(dto: { cadence?: string; dayOfWeek?: number; dayOfMonth?: number; hourUtc?: number }): void {
    if (dto.cadence && !Object.values(ReportCadence).includes(dto.cadence as ReportCadence)) {
      throw new BadRequestException(`cadence must be one of ${Object.values(ReportCadence).join(', ')}`);
    }
    if (dto.hourUtc != null && (dto.hourUtc < 0 || dto.hourUtc > 23)) throw new BadRequestException('hourUtc must be 0–23');
    if (dto.dayOfWeek != null && (dto.dayOfWeek < 0 || dto.dayOfWeek > 6)) throw new BadRequestException('dayOfWeek must be 0–6');
    if (dto.dayOfMonth != null && (dto.dayOfMonth < 1 || dto.dayOfMonth > 31)) throw new BadRequestException('dayOfMonth must be 1–31');
  }

  async create(
    userId: string,
    tenantId: string,
    dto: {
      reportCode: string; name: string; recipients: string[]; cadence?: ReportCadence;
      dayOfWeek?: number; dayOfMonth?: number; hourUtc?: number;
      viewId?: string; filters?: ReportFilter[]; sortBy?: string; sortDir?: string;
    },
    now: Date = new Date(),
  ): Promise<ReportSchedule> {
    const def = REPORT_BY_CODE.get(dto.reportCode);
    if (!def) throw new NotFoundException(`Unknown report '${dto.reportCode}'`);
    // Reuse the engine's checks: permission + filter validity.
    await this.reports.describe(userId, tenantId, dto.reportCode);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');

    const recipients = (dto.recipients ?? []).map((r) => String(r).trim()).filter(Boolean);
    if (!recipients.length) throw new BadRequestException('At least one recipient is required');
    const bad = recipients.find((r) => !EMAIL_RE.test(r));
    if (bad) throw new BadRequestException(`Invalid recipient email: ${bad}`);

    this.validateCadence(dto);

    if (dto.viewId) {
      const view = await this.viewRepo.findOne({ where: { id: dto.viewId, tenantId } });
      if (!view) throw new NotFoundException('Saved view not found');
      if (view.reportCode !== dto.reportCode) throw new BadRequestException('The saved view belongs to a different report');
    } else {
      this.reports.validateFilters(dto.reportCode, dto.filters ?? []);
    }

    const cadence = dto.cadence ?? ReportCadence.WEEKLY;
    const schedule = this.scheduleRepo.create({
      tenantId,
      reportCode: dto.reportCode,
      name: dto.name.trim(),
      recipients,
      cadence,
      dayOfWeek: dto.dayOfWeek ?? null,
      dayOfMonth: dto.dayOfMonth ?? null,
      hourUtc: dto.hourUtc ?? 6,
      viewId: dto.viewId ?? null,
      filters: dto.filters ?? [],
      sortBy: dto.sortBy ?? null,
      sortDir: dto.sortDir === 'ASC' ? 'ASC' : 'DESC',
      active: true,
      nextRunAt: ReportSchedulesService.nextRun({ cadence, dayOfWeek: dto.dayOfWeek, dayOfMonth: dto.dayOfMonth, hourUtc: dto.hourUtc }, now),
      createdByUserId: userId,
    });
    return this.scheduleRepo.save(schedule);
  }

  async list(userId: string, tenantId: string, code: string): Promise<ReportSchedule[]> {
    await this.reports.describe(userId, tenantId, code); // permission gate
    return this.scheduleRepo.find({ where: { tenantId, reportCode: code }, order: { createdAt: 'DESC' } });
  }

  async setActive(userId: string, tenantId: string, id: string, active: boolean): Promise<ReportSchedule> {
    const schedule = await this.scheduleRepo.findOne({ where: { id, tenantId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (schedule.createdByUserId !== userId) throw new ForbiddenException('Only the creator can change a schedule');
    schedule.active = active;
    if (active) {
      schedule.nextRunAt = ReportSchedulesService.nextRun(schedule, new Date());
    }
    return this.scheduleRepo.save(schedule);
  }

  async remove(userId: string, tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const schedule = await this.scheduleRepo.findOne({ where: { id, tenantId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (schedule.createdByUserId !== userId) throw new ForbiddenException('Only the creator can delete a schedule');
    await this.scheduleRepo.delete({ id, tenantId });
    return { deleted: true };
  }

  /** Cross-tenant sweep entry point, called by the hourly scheduler. */
  async runDueSchedules(asOf: Date = new Date()): Promise<ScheduleRunResult[]> {
    const due = await this.scheduleRepo.find({ where: { active: true, nextRunAt: LessThanOrEqual(asOf) } });
    const results: ScheduleRunResult[] = [];
    for (const schedule of due) {
      const result = await this.runOne(schedule, asOf);
      results.push(result);
    }
    return results;
  }

  private async runOne(schedule: ReportSchedule, asOf: Date): Promise<ScheduleRunResult> {
    let status: 'SENT' | 'FAILED' = 'SENT';
    let error: string | undefined;
    try {
      let filters = (schedule.filters ?? []) as ReportFilter[];
      let sortBy = schedule.sortBy ?? undefined;
      let sortDir = schedule.sortDir === 'ASC' ? ('ASC' as const) : ('DESC' as const);
      if (schedule.viewId) {
        const view = await this.viewRepo.findOne({ where: { id: schedule.viewId, tenantId: schedule.tenantId } });
        if (!view) throw new Error('The saved view this schedule pins no longer exists');
        filters = view.filters as ReportFilter[];
        sortBy = view.sortBy ?? undefined;
        sortDir = view.sortDir === 'ASC' ? 'ASC' : 'DESC';
      }
      // Run as the creator: their permissions gate the data.
      const { filename, csv } = await this.reports.exportCsv(
        schedule.createdByUserId, schedule.tenantId, schedule.reportCode,
        { filters, sortBy, sortDir },
      );
      if (!this.email) throw new Error('Email transport is not wired in this deployment');
      const subject = `[Report] ${schedule.name} — ${asOf.toISOString().slice(0, 10)}`;
      const body = `Scheduled report "${schedule.name}" (${schedule.reportCode}) is attached as CSV.`;
      for (const to of schedule.recipients) {
        const sent = await this.email.sendRaw(schedule.tenantId, to, subject, body, [{ filename, content: csv }]);
        if (sent.status !== 'SENT') {
          status = 'FAILED';
          error = sent.error ?? 'email delivery failed';
        }
      }
    } catch (e: any) {
      status = 'FAILED';
      error = e?.message ?? String(e);
      this.logger.warn(`schedule ${schedule.id} (${schedule.reportCode}): ${error}`);
    }
    schedule.lastRunAt = asOf;
    schedule.lastStatus = status;
    schedule.lastError = error ?? null;
    // Always roll forward — a failing schedule must not retry every hour.
    schedule.nextRunAt = ReportSchedulesService.nextRun(schedule, asOf);
    await this.scheduleRepo.save(schedule);
    return {
      scheduleId: schedule.id, tenantId: schedule.tenantId, reportCode: schedule.reportCode,
      name: schedule.name, status, recipients: schedule.recipients.length, error,
    };
  }
}
