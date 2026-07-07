import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LeaseService } from '../../common/leases/lease.service';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import { AutomationService } from './automation.service';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { ServiceTicket, TicketStatus } from '../crm/entities/service-ticket.entity';
import { Contract, ContractStatus } from '../contracts/entities/contract.entity';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Time-based automation. Runs an hourly sweep (plain timers — no external
 * scheduler dependency) that:
 *  - flips SENT/PARTIAL invoices past their due date to OVERDUE and emits
 *    `ar_invoice.overdue` (the status flip is the dedupe);
 *  - flags open tickets past their resolution deadline as SLA-breached and
 *    emits `ticket.sla_breached` (the flag is the dedupe);
 *  - emits `contract.expiring` for ACTIVE contracts ending within 30 days
 *    (deduped per contract per day in-process).
 * Disabled under tests; can be invoked on demand via sweepNow().
 */
@Injectable()
export class AutomationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private kickoff: ReturnType<typeof setTimeout> | null = null;
  private readonly alertedContracts = new Set<string>();
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
  async sweepIfLeader(): Promise<{ overdueInvoices: number; slaBreaches: number; expiringContracts: number } | null> {
    if (this.leases) {
      const isLeader = await this.leases.tryAcquire('automation-sweeps', this.instanceId, 90 * 60_000);
      if (!isLeader) return null;
    }
    return this.sweepNow();
  }

  async sweepNow(): Promise<{ overdueInvoices: number; slaBreaches: number; expiringContracts: number }> {
    const [overdueInvoices, slaBreaches, expiringContracts] = await Promise.all([
      this.sweepOverdueInvoices().catch((e) => { this.logger.warn(`overdue sweep: ${e.message}`); return 0; }),
      this.sweepSlaBreaches().catch((e) => { this.logger.warn(`sla sweep: ${e.message}`); return 0; }),
      this.sweepExpiringContracts().catch((e) => { this.logger.warn(`contract sweep: ${e.message}`); return 0; }),
    ]);
    return { overdueInvoices, slaBreaches, expiringContracts };
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
}
