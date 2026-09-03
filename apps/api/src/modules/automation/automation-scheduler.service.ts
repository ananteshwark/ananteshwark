import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LeaseService } from '../../common/leases/lease.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, LessThanOrEqual, Not, Repository } from 'typeorm';
import { AutomationService } from './automation.service';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { ServiceTicket, TicketStatus } from '../crm/entities/service-ticket.entity';
import { Contract, ContractStatus } from '../contracts/entities/contract.entity';
import { SkillAttestation, AttestationStatus } from '../hr/skills/entities/skill-attestation.entity';
import { CertEnrollment, CertEnrollmentStatus } from '../learning/academy/entities/academy.entity';
import { Visitor, VisitorStatus } from '../platform/device/entities/device.entity';
import { I9Case, I9Status } from '../hr/i9/entities/i9-case.entity';
import { IntegrationsService } from '../studio/integrations/integrations.service';
import { LicensingService } from '../licensing/licensing.service';
import { ReportSchedulesService } from '../reports/report-schedules.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Time-based automation. Runs an hourly sweep (plain timers — no external
 * scheduler dependency) that:
 *  - flips SENT/PARTIAL invoices past their due date to OVERDUE and emits
 *    `ar_invoice.overdue` (the status flip is the dedupe);
 *  - flags open tickets past their resolution deadline as SLA-breached and
 *    emits `ticket.sla_breached` (the flag is the dedupe);
 *  - emits `contract.expiring` for ACTIVE contracts ending within 30 days
 *    (deduped per contract per day in-process);
 *  - expires VERIFIED skill attestations and CERTIFIED academy enrolments
 *    past their expiry (the status flip is the dedupe);
 *  - marks pre-registered visitors whose expected time has passed as NO_SHOW;
 *  - emits `i9.section2_overdue` / `i9.reverification_due` for I-9 compliance
 *    deadlines (deduped per case per day in-process);
 *  - executes due Studio scheduled jobs (rolling nextRunAt is the dedupe);
 *  - runs the monthly license billing cycle (usage snapshot + invoice per
 *    active contract; the existing invoice for the period is the dedupe) and
 *    emits `license.invoice_generated` per new invoice.
 *  - delivers due scheduled reports as CSV email (rolling nextRunAt forward
 *    is the dedupe) and emits `report.schedule_sent` per delivery.
 * The newer sweeps take their dependencies via @Optional() so the scheduler
 * still boots (and tests still construct positionally) without them.
 * Disabled under tests; can be invoked on demand via sweepNow().
 */
@Injectable()
export class AutomationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private kickoff: ReturnType<typeof setTimeout> | null = null;
  private readonly alertedContracts = new Set<string>();
  private readonly alertedI9 = new Set<string>();
  // Identifies this process in the leader-election lease.
  private readonly instanceId = randomUUID();

  constructor(
    private readonly automation: AutomationService,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(ServiceTicket)
    private readonly ticketRepo: Repository<ServiceTicket>,
    @InjectRepository(Contract)
    private readonly contractRepo: Repository<Contract>,
    @Optional() private readonly leases?: LeaseService,
    @Optional() @InjectRepository(SkillAttestation)
    private readonly attestationRepo?: Repository<SkillAttestation>,
    @Optional() @InjectRepository(CertEnrollment)
    private readonly certEnrollRepo?: Repository<CertEnrollment>,
    @Optional() @InjectRepository(Visitor)
    private readonly visitorRepo?: Repository<Visitor>,
    @Optional() @InjectRepository(I9Case)
    private readonly i9Repo?: Repository<I9Case>,
    @Optional() private readonly integrations?: IntegrationsService,
    @Optional() private readonly licensing?: LicensingService,
    @Optional() private readonly reportSchedules?: ReportSchedulesService,
  ) {}

  onModuleInit() {
    if (process.env.JEST_WORKER_ID || process.env.APP_ENV === 'test') return;
    this.kickoff = setTimeout(() => this.sweepIfLeader().catch(() => undefined), 30_000);
    this.timer = setInterval(() => this.sweepIfLeader().catch(() => undefined), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.kickoff) clearTimeout(this.kickoff);
  }

  /**
   * Timer path: only the instance holding the lease sweeps, so a scaled-out
   * deployment fires each event exactly once per tick. The lease TTL (90 min)
   * outlives the hourly renewal, so a crashed leader is replaced within one
   * tick. Manual sweeps via the API bypass election on purpose.
   */
  async sweepIfLeader(): Promise<Record<string, number> | null> {
    if (this.leases) {
      const isLeader = await this.leases.tryAcquire('automation-sweeps', this.instanceId, 90 * 60_000);
      if (!isLeader) return null;
    }
    return this.sweepNow();
  }

  async sweepNow(): Promise<{
    overdueInvoices: number; slaBreaches: number; expiringContracts: number;
    expiredAttestations: number; expiredCertifications: number; visitorNoShows: number;
    i9Alerts: number; studioJobsRun: number; licenseInvoices: number; reportSchedulesRun: number;
  }> {
    const [overdueInvoices, slaBreaches, expiringContracts, expiredAttestations, expiredCertifications, visitorNoShows, i9Alerts, studioJobsRun, licenseInvoices, reportSchedulesRun] = await Promise.all([
      this.sweepOverdueInvoices().catch((e) => { this.logger.warn(`overdue sweep: ${e.message}`); return 0; }),
      this.sweepSlaBreaches().catch((e) => { this.logger.warn(`sla sweep: ${e.message}`); return 0; }),
      this.sweepExpiringContracts().catch((e) => { this.logger.warn(`contract sweep: ${e.message}`); return 0; }),
      this.sweepAttestationExpiry().catch((e) => { this.logger.warn(`attestation sweep: ${e.message}`); return 0; }),
      this.sweepCertificationExpiry().catch((e) => { this.logger.warn(`certification sweep: ${e.message}`); return 0; }),
      this.sweepVisitorNoShows().catch((e) => { this.logger.warn(`visitor sweep: ${e.message}`); return 0; }),
      this.sweepI9Compliance().catch((e) => { this.logger.warn(`i9 sweep: ${e.message}`); return 0; }),
      this.sweepStudioJobs().catch((e) => { this.logger.warn(`studio jobs sweep: ${e.message}`); return 0; }),
      this.sweepLicenseBilling().catch((e) => { this.logger.warn(`license billing sweep: ${e.message}`); return 0; }),
      this.sweepReportSchedules().catch((e) => { this.logger.warn(`report schedules sweep: ${e.message}`); return 0; }),
    ]);
    return { overdueInvoices, slaBreaches, expiringContracts, expiredAttestations, expiredCertifications, visitorNoShows, i9Alerts, studioJobsRun, licenseInvoices, reportSchedulesRun };
  }

  private async sweepOverdueInvoices(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const invoices = await this.invoiceRepo.find({
      where: {
        status: In([InvoiceStatus.SENT, InvoiceStatus.PARTIAL]),
        dueDate: LessThan(today),
      },
    });
    let flipped = 0;
    for (const inv of invoices) {
      if (Number(inv.balanceDue) <= 0) continue;
      inv.status = InvoiceStatus.OVERDUE;
      await this.invoiceRepo.save(inv);
      await this.automation.emit(inv.tenantId, 'ar_invoice.overdue', {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customerId,
        balanceDue: Number(inv.balanceDue),
        dueDate: inv.dueDate,
      });
      flipped++;
    }
    return flipped;
  }

  private async sweepSlaBreaches(): Promise<number> {
    const tickets = await this.ticketRepo.find({
      where: {
        slaBreached: false,
        status: Not(In([TicketStatus.RESOLVED, TicketStatus.CLOSED])),
      },
    });
    const now = Date.now();
    let breached = 0;
    for (const t of tickets) {
      if (!t.slaResolutionDueAt || t.slaResolutionDueAt.getTime() > now) continue;
      t.slaBreached = true;
      await this.ticketRepo.save(t);
      await this.automation.emit(t.tenantId, 'ticket.sla_breached', {
        ticketId: t.id,
        ticketNumber: t.ticketNumber,
        priority: t.priority,
        assignedToUserId: (t as any).assignedToUserId ?? null,
        slaResolutionDueAt: t.slaResolutionDueAt,
      });
      breached++;
    }
    return breached;
  }

  private async sweepExpiringContracts(): Promise<number> {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const contracts = await this.contractRepo.find({ where: { status: ContractStatus.ACTIVE } });
    let alerts = 0;
    for (const c of contracts) {
      if (!c.endDate || c.endDate < todayStr || c.endDate > cutoffStr) continue;
      const dedupeKey = `${c.id}:${todayStr}`;
      if (this.alertedContracts.has(dedupeKey)) continue;
      this.alertedContracts.add(dedupeKey);
      await this.automation.emit(c.tenantId, 'contract.expiring', {
        contractId: c.id,
        contractNumber: c.contractNumber,
        title: c.title,
        endDate: c.endDate,
      });
      alerts++;
    }
    return alerts;
  }

  /** Flip VERIFIED skill attestations past their expiry to EXPIRED. */
  private async sweepAttestationExpiry(): Promise<number> {
    if (!this.attestationRepo) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const due = await this.attestationRepo.find({
      where: { status: AttestationStatus.VERIFIED, expiresAt: LessThan(today) },
    });
    for (const a of due) {
      a.status = AttestationStatus.EXPIRED;
      await this.attestationRepo.save(a);
    }
    return due.length;
  }

  /** Flip CERTIFIED academy enrolments past their expiry to EXPIRED. */
  private async sweepCertificationExpiry(): Promise<number> {
    if (!this.certEnrollRepo) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const due = await this.certEnrollRepo.find({
      where: { status: CertEnrollmentStatus.CERTIFIED, expiresAt: LessThanOrEqual(today) },
    });
    for (const e of due) {
      e.status = CertEnrollmentStatus.EXPIRED;
      await this.certEnrollRepo.save(e);
    }
    return due.length;
  }

  /** Mark pre-registered visitors whose expected time has passed as NO_SHOW. */
  private async sweepVisitorNoShows(): Promise<number> {
    if (!this.visitorRepo) return 0;
    const due = await this.visitorRepo.find({
      where: { status: VisitorStatus.PRE_REGISTERED, expectedAt: LessThan(new Date()) },
    });
    for (const v of due) {
      v.status = VisitorStatus.NO_SHOW;
      await this.visitorRepo.save(v);
    }
    return due.length;
  }

  /**
   * I-9 compliance alerts: Section 2 past its 3-business-day deadline while
   * still pending, and completed cases whose reverification date has arrived.
   * Alert-only (no status flip), so deduped per case per day in-process.
   */
  private async sweepI9Compliance(): Promise<number> {
    if (!this.i9Repo) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let alerts = 0;

    const overdue = await this.i9Repo.find({
      where: { status: I9Status.SECTION2_PENDING, section2DueDate: LessThan(today) },
    });
    for (const k of overdue) {
      const key = `s2:${k.id}:${today}`;
      if (this.alertedI9.has(key)) continue;
      this.alertedI9.add(key);
      await this.automation.emit(k.tenantId, 'i9.section2_overdue', {
        caseId: k.id, employeeId: k.employeeId, employeeName: k.employeeName, section2DueDate: k.section2DueDate,
      });
      alerts++;
    }

    const reverify = await this.i9Repo.find({
      where: { status: I9Status.COMPLETE, reverificationDate: LessThanOrEqual(today) },
    });
    for (const k of reverify) {
      const key = `rv:${k.id}:${today}`;
      if (this.alertedI9.has(key)) continue;
      this.alertedI9.add(key);
      await this.automation.emit(k.tenantId, 'i9.reverification_due', {
        caseId: k.id, employeeId: k.employeeId, employeeName: k.employeeName, reverificationDate: k.reverificationDate,
      });
      alerts++;
    }
    return alerts;
  }

  /**
   * Monthly license billing: snapshot + invoice per active contract whose
   * cycle has closed. The invoice-per-period dedupe inside the licensing
   * service makes the hourly cadence safe.
   */
  private async sweepLicenseBilling(): Promise<number> {
    if (!this.licensing) return 0;
    const result = await this.licensing.runMonthlyBillingCycle(new Date());
    for (const inv of result.invoices) {
      await this.automation.emit(inv.tenantId, 'license.invoice_generated', {
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        contractId: inv.contractId,
        totalAmount: inv.totalAmount,
        periodStart: inv.periodStart,
        periodEnd: inv.periodEnd,
      });
    }
    return result.invoicesGenerated;
  }

  /** Deliver due scheduled reports; rolling nextRunAt forward is the dedupe. */
  private async sweepReportSchedules(): Promise<number> {
    if (!this.reportSchedules) return 0;
    const results = await this.reportSchedules.runDueSchedules(new Date());
    for (const r of results) {
      await this.automation.emit(r.tenantId, 'report.schedule_sent', {
        scheduleId: r.scheduleId, reportCode: r.reportCode, name: r.name,
        status: r.status, recipients: r.recipients, error: r.error ?? null,
      });
    }
    return results.length;
  }

  /** Execute due Studio scheduled jobs; rolling nextRunAt forward is the dedupe. */
  private async sweepStudioJobs(): Promise<number> {
    if (!this.integrations) return 0;
    const now = new Date();
    const due = await this.integrations.dueJobsAll(now);
    let run = 0;
    for (const job of due) {
      try {
        await this.integrations.runJob(job.tenantId, job.id, [], now);
        run++;
      } catch (e: any) {
        this.logger.warn(`studio job ${job.id}: ${e?.message}`);
      }
    }
    return run;
  }
}
