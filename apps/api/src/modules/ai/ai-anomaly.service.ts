import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseClaim } from '../expenses/entities/expense-claim.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { VendorInvoice } from '../procurement/vendor-invoice/entities/vendor-invoice.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { Payslip } from '../payroll/runs/entities/payslip.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { JournalAnomalyService } from '../finance/close/journal-anomaly.service';
import { AutomationService } from '../automation/automation.service';
import { JobsService } from '../../common/jobs/jobs.service';
import { groupBy, groupOutliers, duplicateGroups, spikeRatio, round2 } from './anomaly-stats';

export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

export interface AnomalyFinding {
  module: string;
  check: string;
  severity: Severity;
  subjectType: string;
  subjectId: string;
  title: string;
  detail: string;
}

const SCAN_LIMIT = 5000;
const SEVERITY_RANK: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * The AI anomaly layer: one scoring engine (z-score outliers, exact-duplicate
 * clustering, volume-spike detection) applied per business module. Every
 * detector is isolated — a module whose repository is unavailable or whose
 * scan throws simply contributes zero findings — so the endpoint always
 * answers with whatever coverage the deployment has.
 */
@Injectable()
export class AiAnomalyService {
  private readonly logger = new Logger(AiAnomalyService.name);

  constructor(
    @Optional() @InjectRepository(ExpenseClaim) private readonly claimRepo?: Repository<ExpenseClaim>,
    @Optional() @InjectRepository(PurchaseOrder) private readonly poRepo?: Repository<PurchaseOrder>,
    @Optional() @InjectRepository(VendorInvoice) private readonly vendorInvoiceRepo?: Repository<VendorInvoice>,
    @Optional() @InjectRepository(SalesOrder) private readonly salesOrderRepo?: Repository<SalesOrder>,
    @Optional() @InjectRepository(Invoice) private readonly arInvoiceRepo?: Repository<Invoice>,
    @Optional() @InjectRepository(Payslip) private readonly payslipRepo?: Repository<Payslip>,
    @Optional() @InjectRepository(ServiceTicket) private readonly ticketRepo?: Repository<ServiceTicket>,
    @Optional() private readonly journalAnomalies?: JournalAnomalyService,
    @Optional() private readonly automation?: AutomationService,
    @Optional() private readonly jobs?: JobsService,
  ) {
    // Durable scan: any instance can pick the job up; results flow to the
    // automation engine so tenants get notified instead of polling the page.
    this.jobs?.registerHandler('ai-anomaly-scan', async (payload) => {
      if (payload?.tenantId) await this.scanAndNotify(payload.tenantId);
    });
  }

  /** Enqueue a durable background scan for a tenant. */
  async scheduleScan(tenantId: string, runAt?: Date) {
    if (!this.jobs) throw new Error('Durable jobs are not available in this deployment');
    return this.jobs.enqueue('ai-anomaly-scan', { tenantId }, { tenantId, runAt });
  }

  /** Run the full scan and emit anomaly.detected when anything surfaces. */
  async scanAndNotify(tenantId: string) {
    const result = await this.scan(tenantId);
    if (result.findings.length) {
      const high = result.findings.filter((f) => f.severity === 'HIGH').length;
      await this.automation?.emit(tenantId, 'anomaly.detected', {
        totalFindings: result.findings.length,
        highSeverity: high,
        byModule: result.summary,
        topFindings: result.findings.slice(0, 5).map((f) => `${f.severity} [${f.module}] ${f.title}`),
      });
    }
    return result;
  }

  coverage() {
    return [
      { module: 'expenses', checks: ['AMOUNT_OUTLIER', 'DUPLICATE_CLAIM'], available: !!this.claimRepo },
      { module: 'procurement', checks: ['PO_AMOUNT_OUTLIER', 'SAME_DAY_PO_CLUSTER', 'DUPLICATE_VENDOR_INVOICE'], available: !!this.poRepo && !!this.vendorInvoiceRepo },
      { module: 'sales', checks: ['ORDER_AMOUNT_OUTLIER'], available: !!this.salesOrderRepo },
      { module: 'finance', checks: ['AR_INVOICE_OUTLIER', 'JOURNAL_ANOMALIES'], available: !!this.arInvoiceRepo },
      { module: 'payroll', checks: ['NET_PAY_SWING'], available: !!this.payslipRepo },
      { module: 'crm', checks: ['TICKET_VOLUME_SPIKE'], available: !!this.ticketRepo },
    ];
  }

  async scan(tenantId: string, modules?: string[]): Promise<{
    findings: AnomalyFinding[];
    summary: Record<string, number>;
    coverage: Array<{ module: string; checks: string[]; available: boolean }>;
  }> {
    const wanted = (name: string) => !modules?.length || modules.includes(name);
    const detectors: Array<[string, () => Promise<AnomalyFinding[]>]> = [
      ['expenses', () => this.scanExpenses(tenantId)],
      ['procurement', () => this.scanProcurement(tenantId)],
      ['sales', () => this.scanSales(tenantId)],
      ['finance', () => this.scanFinance(tenantId)],
      ['payroll', () => this.scanPayroll(tenantId)],
      ['crm', () => this.scanCrm(tenantId)],
    ];

    const findings: AnomalyFinding[] = [];
    for (const [name, run] of detectors) {
      if (!wanted(name)) continue;
      try {
        findings.push(...(await run()));
      } catch (e: any) {
        this.logger.warn(`${name} anomaly scan failed: ${e.message}`);
      }
    }
    findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

    const summary: Record<string, number> = {};
    for (const f of findings) summary[f.module] = (summary[f.module] ?? 0) + 1;
    return { findings, summary, coverage: this.coverage() };
  }

  // ─── Expenses ─────────────────────────────────────────────────

  private async scanExpenses(tenantId: string): Promise<AnomalyFinding[]> {
    if (!this.claimRepo) return [];
    const claims = await this.claimRepo.find({
      where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
    });
    const findings: AnomalyFinding[] = [];

    for (const hit of groupOutliers(claims, (c: any) => c.employeeId, (c: any) => Number(c.totalAmount))) {
      const claim: any = hit.item;
      findings.push({
        module: 'expenses', check: 'AMOUNT_OUTLIER',
        severity: hit.z > 4 ? 'HIGH' : 'MEDIUM',
        subjectType: 'expense_claim', subjectId: claim.id,
        title: `Claim ${claim.claimNumber} is ${hit.z.toFixed(1)}σ above this employee's average`,
        detail: `${round2(hit.value)} vs a personal average of ${round2(hit.mean)}`,
      });
    }
    for (const group of duplicateGroups(
      claims.filter((c: any) => Number(c.totalAmount) > 0),
      (c: any) => `${c.employeeId}|${round2(Number(c.totalAmount))}|${c.claimDate}`,
    )) {
      const [first, ...rest] = group as any[];
      for (const dupe of rest) {
        findings.push({
          module: 'expenses', check: 'DUPLICATE_CLAIM', severity: 'HIGH',
          subjectType: 'expense_claim', subjectId: dupe.id,
          title: `Claim ${dupe.claimNumber} duplicates ${first.claimNumber}`,
          detail: `Same employee, same amount ${round2(Number(dupe.totalAmount))}, same date ${dupe.claimDate}`,
        });
      }
    }
    return findings;
  }

  // ─── Procurement ──────────────────────────────────────────────

  private async scanProcurement(tenantId: string): Promise<AnomalyFinding[]> {
    const findings: AnomalyFinding[] = [];
    if (this.poRepo) {
      const pos = await this.poRepo.find({
        where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
      });
      for (const hit of groupOutliers(pos, (p: any) => p.vendorId, (p: any) => Number(p.total))) {
        const po: any = hit.item;
        findings.push({
          module: 'procurement', check: 'PO_AMOUNT_OUTLIER',
          severity: hit.z > 4 ? 'HIGH' : 'MEDIUM',
          subjectType: 'purchase_order', subjectId: po.id,
          title: `PO ${po.poNumber} is ${hit.z.toFixed(1)}σ above this vendor's average`,
          detail: `${round2(hit.value)} vs a vendor average of ${round2(hit.mean)}`,
        });
      }
      // Several POs to one vendor on one day can be an approval-band split.
      for (const group of duplicateGroups(pos, (p: any) => `${p.vendorId}|${p.poDate}`)) {
        if (group.length < 3) continue;
        const sample: any = group[0];
        const total = round2(group.reduce((s, p: any) => s + Number(p.total), 0));
        findings.push({
          module: 'procurement', check: 'SAME_DAY_PO_CLUSTER', severity: 'MEDIUM',
          subjectType: 'vendor', subjectId: sample.vendorId,
          title: `${group.length} POs to ${sample.vendorName ?? 'one vendor'} on ${sample.poDate}`,
          detail: `Combined value ${total} — review for split purchasing`,
        });
      }
    }
    if (this.vendorInvoiceRepo) {
      const invoices = await this.vendorInvoiceRepo.find({
        where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
      });
      for (const group of duplicateGroups(
        invoices.filter((i: any) => i.vendorInvoiceRef),
        (i: any) => `${i.vendorId}|${String(i.vendorInvoiceRef).trim().toLowerCase()}`,
      )) {
        const [first, ...rest] = group as any[];
        for (const dupe of rest) {
          findings.push({
            module: 'procurement', check: 'DUPLICATE_VENDOR_INVOICE', severity: 'HIGH',
            subjectType: 'vendor_invoice', subjectId: dupe.id,
            title: `Vendor invoice ref "${dupe.vendorInvoiceRef}" entered twice`,
            detail: `Duplicates ${first.id} for the same vendor — double-payment risk`,
          });
        }
      }
    }
    return findings;
  }

  // ─── Sales ────────────────────────────────────────────────────

  private async scanSales(tenantId: string): Promise<AnomalyFinding[]> {
    if (!this.salesOrderRepo) return [];
    const orders = await this.salesOrderRepo.find({
      where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
    });
    return groupOutliers(orders, (o: any) => o.customerId, (o: any) => Number(o.total)).map((hit) => {
      const order: any = hit.item;
      return {
        module: 'sales', check: 'ORDER_AMOUNT_OUTLIER',
        severity: hit.z > 4 ? 'HIGH' : 'MEDIUM',
        subjectType: 'sales_order', subjectId: order.id,
        title: `Order ${order.orderNumber} is ${hit.z.toFixed(1)}σ above this customer's average`,
        detail: `${round2(hit.value)} vs a customer average of ${round2(hit.mean)}`,
      } as AnomalyFinding;
    });
  }

  // ─── Finance ──────────────────────────────────────────────────

  private async scanFinance(tenantId: string): Promise<AnomalyFinding[]> {
    const findings: AnomalyFinding[] = [];
    if (this.arInvoiceRepo) {
      const invoices = await this.arInvoiceRepo.find({
        where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
      });
      for (const hit of groupOutliers(invoices, (i: any) => i.customerId, (i: any) => Number(i.total))) {
        const invoice: any = hit.item;
        findings.push({
          module: 'finance', check: 'AR_INVOICE_OUTLIER',
          severity: hit.z > 4 ? 'HIGH' : 'MEDIUM',
          subjectType: 'ar_invoice', subjectId: invoice.id,
          title: `Invoice ${invoice.invoiceNumber} is ${hit.z.toFixed(1)}σ above this customer's average`,
          detail: `${round2(hit.value)} vs a customer average of ${round2(hit.mean)}`,
        });
      }
    }
    if (this.journalAnomalies) {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const scan = await this.journalAnomalies.scan(tenantId, from, to);
      findings.push(...scan.anomalies.map((a) => ({
        module: 'finance', check: `JOURNAL_${a.check}`,
        severity: a.severity as Severity,
        subjectType: 'journal_entry', subjectId: a.entryId,
        title: `Journal ${a.entryNumber}: ${a.check.replace(/_/g, ' ').toLowerCase()}`,
        detail: a.detail,
      })));
    }
    return findings;
  }

  // ─── Payroll ──────────────────────────────────────────────────

  private async scanPayroll(tenantId: string): Promise<AnomalyFinding[]> {
    if (!this.payslipRepo) return [];
    const payslips = await this.payslipRepo.find({
      where: { tenantId }, order: { payPeriodYear: 'DESC', payPeriodMonth: 'DESC' } as any, take: SCAN_LIMIT,
    });
    const findings: AnomalyFinding[] = [];
    for (const [, slips] of groupBy(payslips, (p: any) => p.employeeId)) {
      const ordered = [...slips].sort((a: any, b: any) =>
        a.payPeriodYear - b.payPeriodYear || a.payPeriodMonth - b.payPeriodMonth);
      for (let i = 1; i < ordered.length; i++) {
        const prev = Number((ordered[i - 1] as any).netPay);
        const curr = Number((ordered[i] as any).netPay);
        if (prev <= 0) continue;
        const swing = Math.abs(curr - prev) / prev;
        if (swing > 0.3) {
          const slip: any = ordered[i];
          findings.push({
            module: 'payroll', check: 'NET_PAY_SWING',
            severity: swing > 0.5 ? 'HIGH' : 'MEDIUM',
            subjectType: 'payslip', subjectId: slip.id,
            title: `${slip.employeeName ?? 'Employee'} net pay moved ${Math.round(swing * 100)}% in ${slip.payPeriodMonth}/${slip.payPeriodYear}`,
            detail: `${round2(prev)} → ${round2(curr)} month over month`,
          });
        }
      }
    }
    return findings;
  }

  // ─── CRM ──────────────────────────────────────────────────────

  private async scanCrm(tenantId: string): Promise<AnomalyFinding[]> {
    if (!this.ticketRepo) return [];
    const tickets = await this.ticketRepo.find({
      where: { tenantId }, order: { createdAt: 'DESC' } as any, take: SCAN_LIMIT,
    });
    const now = Date.now();
    const recent = tickets.filter((t: any) => now - new Date(t.createdAt).getTime() <= 7 * 86_400_000).length;
    const baseline = tickets.filter((t: any) => {
      const age = now - new Date(t.createdAt).getTime();
      return age > 7 * 86_400_000 && age <= 35 * 86_400_000;
    }).length;
    const ratio = spikeRatio(recent, 7, baseline, 28);
    if (ratio >= 2 && recent >= 5) {
      return [{
        module: 'crm', check: 'TICKET_VOLUME_SPIKE',
        severity: ratio >= 3 ? 'HIGH' : 'MEDIUM',
        subjectType: 'tenant', subjectId: tenantId,
        title: `Ticket volume is ${Number.isFinite(ratio) ? ratio.toFixed(1) + '×' : 'far above'} the 4-week baseline`,
        detail: `${recent} tickets in the last 7 days vs ${baseline} in the prior 28 — something may be broken upstream`,
      }];
    }
    return [];
  }
}
