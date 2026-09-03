import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, Not } from 'typeorm';
import { RosterDemand, RosterEntry, RosterEntryStatus, RosterSource } from './roster.entity';
import { Shift } from '../attendance/entities/shift.entity';
import { Employee, EmployeeStatus } from '../employees/entities/employee.entity';
import { LeaveApplication, LeaveApplicationStatus } from '../leave/entities/leave-application.entity';
import { AutomationService } from '../../automation/automation.service';

/** Monday of the ISO week a date falls in — the fairness/limit bucket. */
export function weekOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayFromMonday);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class RosterService {
  constructor(
    @InjectRepository(RosterDemand) private readonly demandRepo: Repository<RosterDemand>,
    @InjectRepository(RosterEntry) private readonly entryRepo: Repository<RosterEntry>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(LeaveApplication) private readonly leaveRepo: Repository<LeaveApplication>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Demand ───────────────────────────────────────────────────

  async upsertDemand(
    tenantId: string,
    dto: { shiftId: string; date: string; requiredHeadcount: number; departmentId?: string; notes?: string },
  ): Promise<RosterDemand> {
    if (!dto.date || !dto.shiftId) throw new BadRequestException('shiftId and date are required');
    if (!(Number(dto.requiredHeadcount) > 0)) throw new BadRequestException('requiredHeadcount must be positive');
    const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, tenantId } });
    if (!shift) throw new NotFoundException(`Shift ${dto.shiftId} not found`);

    const existing = await this.demandRepo.findOne({
      where: { tenantId, shiftId: dto.shiftId, date: dto.date, departmentId: dto.departmentId ?? null } as any,
    });
    if (existing) {
      existing.requiredHeadcount = Number(dto.requiredHeadcount);
      existing.notes = dto.notes ?? existing.notes;
      return this.demandRepo.save(existing);
    }
    return this.demandRepo.save(this.demandRepo.create({
      tenantId,
      shiftId: dto.shiftId,
      shiftName: shift.name,
      date: dto.date,
      requiredHeadcount: Number(dto.requiredHeadcount),
      departmentId: dto.departmentId ?? null,
      notes: dto.notes ?? null,
    }));
  }

  async coverage(tenantId: string, from: string, to: string) {
    const demands = await this.demandRepo.find({ where: { tenantId, date: Between(from, to) }, order: { date: 'ASC' } });
    const entries = await this.entryRepo.find({
      where: { tenantId, date: Between(from, to), status: Not(RosterEntryStatus.CANCELLED) },
    });
    const assignedByDemand = new Map<string, number>();
    for (const e of entries) assignedByDemand.set(e.demandId, (assignedByDemand.get(e.demandId) ?? 0) + 1);
    return demands.map((d) => {
      const assigned = assignedByDemand.get(d.id) ?? 0;
      return { ...d, assigned, gap: Math.max(0, d.requiredHeadcount - assigned) };
    });
  }

  async listEntries(tenantId: string, from: string, to: string, employeeId?: string): Promise<RosterEntry[]> {
    return this.entryRepo.find({
      where: {
        tenantId,
        date: Between(from, to),
        status: Not(RosterEntryStatus.CANCELLED),
        ...(employeeId ? { employeeId } : {}),
      },
      order: { date: 'ASC' },
    });
  }

  // ─── Availability rules ───────────────────────────────────────

  private async onApprovedLeave(tenantId: string, employeeId: string, date: string): Promise<boolean> {
    const leaves = await this.leaveRepo.find({
      where: { tenantId, employeeId, status: LeaveApplicationStatus.APPROVED },
    });
    return leaves.some((l) => l.fromDate <= date && date <= l.toDate);
  }

  private async alreadyRostered(tenantId: string, employeeId: string, date: string): Promise<boolean> {
    const clash = await this.entryRepo.findOne({
      where: { tenantId, employeeId, date, status: Not(RosterEntryStatus.CANCELLED) },
    });
    return !!clash;
  }

  // ─── Manual assignment ────────────────────────────────────────

  async assign(tenantId: string, demandId: string, employeeId: string): Promise<RosterEntry> {
    const demand = await this.demandRepo.findOne({ where: { id: demandId, tenantId } });
    if (!demand) throw new NotFoundException(`Roster demand ${demandId} not found`);
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const assigned = await this.entryRepo.count({
      where: { tenantId, demandId, status: Not(RosterEntryStatus.CANCELLED) },
    });
    if (assigned >= demand.requiredHeadcount) {
      throw new BadRequestException('This shift is already fully staffed');
    }
    if (await this.alreadyRostered(tenantId, employeeId, demand.date)) {
      throw new BadRequestException('Employee is already rostered on this date');
    }
    if (await this.onApprovedLeave(tenantId, employeeId, demand.date)) {
      throw new BadRequestException('Employee is on approved leave on this date');
    }
    return this.entryRepo.save(this.entryRepo.create({
      tenantId,
      demandId,
      shiftId: demand.shiftId,
      date: demand.date,
      employeeId,
      employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' '),
      status: RosterEntryStatus.DRAFT,
      source: RosterSource.MANUAL,
    }));
  }

  async unassign(tenantId: string, entryId: string): Promise<void> {
    const entry = await this.entryRepo.findOne({ where: { id: entryId, tenantId } });
    if (!entry) throw new NotFoundException(`Roster entry ${entryId} not found`);
    entry.status = RosterEntryStatus.CANCELLED;
    await this.entryRepo.save(entry);
  }

  // ─── Auto-assignment ──────────────────────────────────────────

  /**
   * Greedy coverage fill. For each open slot (date order): candidates are
   * active employees who are not already rostered that day, not on approved
   * leave, and under the weekly shift cap; the least-loaded candidate in the
   * range is picked first so hours spread evenly. Unfillable slots are
   * reported, never silently dropped.
   */
  async autoAssign(
    tenantId: string,
    opts: { from: string; to: string; maxShiftsPerWeek?: number; departmentId?: string },
  ): Promise<{ assigned: number; unfilled: Array<{ demandId: string; date: string; shiftName: string | null; shortfall: number }> }> {
    const maxPerWeek = opts.maxShiftsPerWeek ?? 5;
    const demands = (await this.demandRepo.find({
      where: { tenantId, date: Between(opts.from, opts.to) },
      order: { date: 'ASC' },
    })).filter((d) => !opts.departmentId || d.departmentId === opts.departmentId || d.departmentId === null);

    const employees = await this.employeeRepo.find({
      where: {
        tenantId,
        status: EmployeeStatus.ACTIVE,
        ...(opts.departmentId ? { departmentId: opts.departmentId } : {}),
      } as any,
    });
    const existing = await this.entryRepo.find({
      where: { tenantId, date: Between(opts.from, opts.to), status: Not(RosterEntryStatus.CANCELLED) },
    });
    const leaves = await this.leaveRepo.find({
      where: { tenantId, status: LeaveApplicationStatus.APPROVED, employeeId: In(employees.map((e) => e.id)) },
    });

    // In-memory occupancy indexes updated as we assign.
    const byDay = new Map<string, Set<string>>();          // date → employee ids
    const byWeek = new Map<string, number>();              // `${employeeId}|${week}` → count
    const byDemand = new Map<string, number>();            // demandId → assigned
    const load = new Map<string, number>();                // employeeId → total in range
    for (const e of existing) {
      (byDay.get(e.date) ?? byDay.set(e.date, new Set()).get(e.date)!).add(e.employeeId);
      const wk = `${e.employeeId}|${weekOf(e.date)}`;
      byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
      byDemand.set(e.demandId, (byDemand.get(e.demandId) ?? 0) + 1);
      load.set(e.employeeId, (load.get(e.employeeId) ?? 0) + 1);
    }
    const onLeave = (employeeId: string, date: string) =>
      leaves.some((l) => l.employeeId === employeeId && l.fromDate <= date && date <= l.toDate);

    const created: RosterEntry[] = [];
    const unfilled: Array<{ demandId: string; date: string; shiftName: string | null; shortfall: number }> = [];

    for (const demand of demands) {
      let open = demand.requiredHeadcount - (byDemand.get(demand.id) ?? 0);
      while (open > 0) {
        const week = weekOf(demand.date);
        const candidates = employees
          .filter((emp) =>
            !(byDay.get(demand.date)?.has(emp.id)) &&
            (byWeek.get(`${emp.id}|${week}`) ?? 0) < maxPerWeek &&
            !onLeave(emp.id, demand.date))
          .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
        const pick = candidates[0];
        if (!pick) break;

        created.push(this.entryRepo.create({
          tenantId,
          demandId: demand.id,
          shiftId: demand.shiftId,
          date: demand.date,
          employeeId: pick.id,
          employeeName: [pick.firstName, pick.lastName].filter(Boolean).join(' '),
          status: RosterEntryStatus.DRAFT,
          source: RosterSource.AUTO,
        }));
        (byDay.get(demand.date) ?? byDay.set(demand.date, new Set()).get(demand.date)!).add(pick.id);
        byWeek.set(`${pick.id}|${week}`, (byWeek.get(`${pick.id}|${week}`) ?? 0) + 1);
        load.set(pick.id, (load.get(pick.id) ?? 0) + 1);
        open -= 1;
      }
      if (open > 0) {
        unfilled.push({ demandId: demand.id, date: demand.date, shiftName: demand.shiftName, shortfall: open });
      }
    }

    if (created.length) await this.entryRepo.save(created);
    return { assigned: created.length, unfilled };
  }

  /** Publish the roster for a range: draft entries become visible/binding. */
  async publish(tenantId: string, from: string, to: string): Promise<{ published: number }> {
    const drafts = await this.entryRepo.find({
      where: { tenantId, date: Between(from, to), status: RosterEntryStatus.DRAFT },
    });
    for (const entry of drafts) entry.status = RosterEntryStatus.PUBLISHED;
    if (drafts.length) await this.entryRepo.save(drafts);
    await this.automation?.emit(tenantId, 'roster.published', { from, to, entryCount: drafts.length });
    return { published: drafts.length };
  }
}
