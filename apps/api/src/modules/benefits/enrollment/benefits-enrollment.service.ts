import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentWindow, WindowType, WindowStatus } from './entities/enrollment-window.entity';
import { LifeEvent, LifeEventType, LifeEventStatus } from './entities/life-event.entity';
import { BenefitPlan } from '../entities/benefit-plan.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class BenefitsEnrollmentService {
  constructor(
    @InjectRepository(EnrollmentWindow) private readonly windowRepo: Repository<EnrollmentWindow>,
    @InjectRepository(LifeEvent) private readonly eventRepo: Repository<LifeEvent>,
    @InjectRepository(BenefitPlan) private readonly planRepo: Repository<BenefitPlan>,
  ) {}

  private addDays(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ─── Ph-178: open enrollment windows ──────────────────────────────

  listWindows(tenantId: string): Promise<EnrollmentWindow[]> {
    return this.windowRepo.find({ where: { tenantId }, order: { startDate: 'DESC' } });
  }

  async createWindow(tenantId: string, data: {
    name: string; windowType?: WindowType; planYear: number; startDate: string; endDate: string;
  }): Promise<EnrollmentWindow> {
    if (!data.name || !data.startDate || !data.endDate) throw new BadRequestException('name, startDate and endDate are required');
    if (data.endDate < data.startDate) throw new BadRequestException('endDate must be on/after startDate');
    const w = this.windowRepo.create({
      tenantId, name: data.name, windowType: data.windowType ?? WindowType.OPEN, planYear: data.planYear,
      startDate: data.startDate, endDate: data.endDate, status: WindowStatus.SCHEDULED,
    } as any) as unknown as EnrollmentWindow;
    return (this.windowRepo.save(w) as unknown) as Promise<EnrollmentWindow>;
  }

  async setWindowStatus(tenantId: string, id: string, status: WindowStatus): Promise<EnrollmentWindow> {
    const w = await this.windowRepo.findOne({ where: { id, tenantId } });
    if (!w) throw new NotFoundException(`Window ${id} not found`);
    w.status = status;
    return (this.windowRepo.save(w) as unknown) as Promise<EnrollmentWindow>;
  }

  async isOpenWindowActive(tenantId: string, onDate: string): Promise<boolean> {
    const windows = await this.windowRepo.find({ where: { tenantId, status: WindowStatus.OPEN } });
    return windows.some((w) => w.startDate <= onDate && w.endDate >= onDate);
  }

  // ─── Ph-179: life events ──────────────────────────────────────────

  listLifeEvents(tenantId: string, params: { employeeId?: string; status?: LifeEventStatus } = {}): Promise<LifeEvent[]> {
    const where: any = { tenantId };
    if (params.employeeId) where.employeeId = params.employeeId;
    if (params.status) where.status = params.status;
    return this.eventRepo.find({ where, order: { eventDate: 'DESC' } });
  }

  async recordLifeEvent(tenantId: string, data: {
    employeeId: string; eventType: LifeEventType; eventDate: string; electionDays?: number; notes?: string;
  }): Promise<LifeEvent> {
    if (!data.employeeId || !data.eventType || !data.eventDate) {
      throw new BadRequestException('employeeId, eventType and eventDate are required');
    }
    const deadline = this.addDays(data.eventDate, data.electionDays ?? 30);
    const e = this.eventRepo.create({
      tenantId, employeeId: data.employeeId, eventType: data.eventType, eventDate: data.eventDate,
      electionDeadline: deadline, status: LifeEventStatus.OPEN, notes: data.notes ?? null,
    } as any) as unknown as LifeEvent;
    return (this.eventRepo.save(e) as unknown) as Promise<LifeEvent>;
  }

  async completeLifeEvent(tenantId: string, id: string): Promise<LifeEvent> {
    const e = await this.eventRepo.findOne({ where: { id, tenantId } });
    if (!e) throw new NotFoundException(`Life event ${id} not found`);
    if (e.status !== LifeEventStatus.OPEN) throw new BadRequestException(`Life event is ${e.status}`);
    e.status = LifeEventStatus.COMPLETED;
    return (this.eventRepo.save(e) as unknown) as Promise<LifeEvent>;
  }

  /** Expire life events whose election deadline has passed. */
  async expireLapsedEvents(tenantId: string, asOf: string): Promise<{ expired: number }> {
    const open = await this.eventRepo.find({ where: { tenantId, status: LifeEventStatus.OPEN } });
    let expired = 0;
    for (const e of open) {
      if (e.electionDeadline < asOf) {
        e.status = LifeEventStatus.EXPIRED;
        await this.eventRepo.save(e);
        expired++;
      }
    }
    return { expired };
  }

  /**
   * Whether an employee may elect benefits on a date: either an OPEN-enrollment
   * window is active, or the employee has an OPEN life event still within its
   * election deadline.
   */
  async canElect(tenantId: string, employeeId: string, onDate: string): Promise<{ eligible: boolean; reason: string }> {
    if (await this.isOpenWindowActive(tenantId, onDate)) {
      return { eligible: true, reason: 'Open enrollment window is active' };
    }
    const events = await this.eventRepo.find({ where: { tenantId, employeeId, status: LifeEventStatus.OPEN } });
    const active = events.find((e) => e.electionDeadline >= onDate);
    if (active) return { eligible: true, reason: `Life event (${active.eventType}) election window open until ${active.electionDeadline}` };
    return { eligible: false, reason: 'No active enrollment window or qualifying life event' };
  }

  // ─── Ph-180: benefit deductions ───────────────────────────────────

  /**
   * Compute the per-pay-period employee deduction and employer contribution for
   * a plan, given a number of pay periods (e.g. 12 monthly, 26 biweekly) and the
   * employee's annual salary for PERCENTAGE plans.
   */
  async computeDeduction(tenantId: string, planId: string, payPeriods: number, annualSalary = 0): Promise<any> {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException(`Plan ${planId} not found`);
    if (!payPeriods || payPeriods <= 0) throw new BadRequestException('payPeriods must be > 0');

    const isPct = (plan as any).contributionType === 'PERCENTAGE';
    const annualEmployee = isPct ? round2((annualSalary * Number(plan.employeeContribution)) / 100) : round2(Number(plan.employeeContribution) * payPeriods);
    const annualEmployer = isPct ? round2((annualSalary * Number(plan.employerContribution)) / 100) : round2(Number(plan.employerContribution) * payPeriods);
    return {
      planId, planName: plan.name, contributionType: isPct ? 'PERCENTAGE' : 'FIXED', payPeriods,
      employeePerPeriod: round2(annualEmployee / payPeriods),
      employerPerPeriod: round2(annualEmployer / payPeriods),
      employeeAnnual: annualEmployee,
      employerAnnual: annualEmployer,
    };
  }
}
