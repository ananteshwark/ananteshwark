import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, In, Not } from 'typeorm';
import { Employee, EmployeeStatus } from '../hr/employees/entities/employee.entity';
import { JobPosting, JobStatus } from '../talent/ats/entities/job-posting.entity';
import { JobOffer } from '../talent/ats/entities/job-offer.entity';
import { PurchaseOrder, PoStatus } from '../procurement/po/entities/purchase-order.entity';
import { Bill, BillStatus } from '../finance/ap/entities/bill.entity';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { CustomerReceipt } from '../finance/ar/entities/customer-receipt.entity';
import { SalesOrder, SalesOrderStatus } from '../sales/entities/sales-order.entity';
import { Account, AccountType } from '../finance/gl/entities/account.entity';
import { JournalLine } from '../finance/gl/entities/journal-line.entity';

/**
 * Read-only cross-module analytics. Every individual metric query is wrapped in
 * safe() so a missing table/column (or any runtime error) returns a fallback
 * value rather than breaking the whole dashboard.
 */
@Injectable()
export class CrossAnalyticsService {
  constructor(
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(JobPosting) private readonly jobPostingRepo: Repository<JobPosting>,
    @InjectRepository(JobOffer) private readonly jobOfferRepo: Repository<JobOffer>,
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(CustomerReceipt) private readonly receiptRepo: Repository<CustomerReceipt>,
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(JournalLine) private readonly journalLineRepo: Repository<JournalLine>,
  ) {}

  /** Run a metric computation, returning `fallback` on any error. */
  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  private round(n: number, dp = 2): number {
    if (!isFinite(n) || isNaN(n)) return 0;
    const f = Math.pow(10, dp);
    return Math.round(n * f) / f;
  }

  private toNum(v: any): number {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) && !isNaN(n) ? n : 0;
  }

  private isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  // ── Hire-to-Retire ─────────────────────────────────────────────────────────
  async hireToRetire(tenantId: string) {
    const since12mo = this.isoDaysAgo(365);

    const headcount = await this.safe(
      () => this.employeeRepo.count({ where: { tenantId } }),
      0,
    );

    const activeCount = await this.safe(
      () => this.employeeRepo.count({ where: { tenantId, status: EmployeeStatus.ACTIVE } }),
      0,
    );

    const newHires12mo = await this.safe(
      () =>
        this.employeeRepo.count({
          where: { tenantId, dateOfJoining: Between(since12mo, this.isoDaysAgo(0)) },
        }),
      0,
    );

    const leavers12mo = await this.safe(
      () =>
        this.employeeRepo.count({
          where: { tenantId, dateOfLeaving: Between(since12mo, this.isoDaysAgo(0)) },
        }),
      0,
    );

    // Average headcount approximation: midpoint of current active and (active + leavers)
    const avgHeadcount = activeCount + leavers12mo / 2;
    const attritionRatePct = this.round(avgHeadcount > 0 ? (leavers12mo / avgHeadcount) * 100 : 0);

    const avgTenureMonths = await this.safe(async () => {
      const rows = await this.employeeRepo.find({
        where: { tenantId, status: EmployeeStatus.ACTIVE },
        select: ['dateOfJoining'],
      });
      if (!rows.length) return 0;
      const now = Date.now();
      let total = 0;
      let counted = 0;
      for (const r of rows) {
        if (!r.dateOfJoining) continue;
        const doj = new Date(r.dateOfJoining).getTime();
        if (isNaN(doj)) continue;
        total += (now - doj) / (1000 * 60 * 60 * 24 * 30.44);
        counted++;
      }
      return counted > 0 ? this.round(total / counted, 1) : 0;
    }, 0);

    const openRequisitions = await this.safe(
      () => this.jobPostingRepo.count({ where: { tenantId, status: JobStatus.PUBLISHED } }),
      0,
    );

    const offerAcceptanceRatePct = await this.safe(async () => {
      const total = await this.jobOfferRepo.count({ where: { tenantId } });
      if (total === 0) return 0;
      const accepted = await this.jobOfferRepo.count({
        where: { tenantId, status: 'ACCEPTED' as any },
      });
      return this.round((accepted / total) * 100);
    }, 0);

    return {
      headcount,
      activeCount,
      attritionRatePct,
      avgTenureMonths,
      newHires12mo,
      openRequisitions,
      offerAcceptanceRatePct,
    };
  }

  // ── Procure-to-Pay ───────────────────────────────────────────────────────────
  async procureToPay(tenantId: string) {
    const since12mo = this.isoDaysAgo(365);
    const today = this.isoDaysAgo(0);
    const openStatuses = [
      PoStatus.APPROVED,
      PoStatus.RELEASED,
      PoStatus.SENT,
      PoStatus.PARTIALLY_RECEIVED,
    ];

    const openPos = await this.safe(
      () => this.poRepo.find({ where: { tenantId, status: In(openStatuses) }, select: ['total'] }),
      [] as PurchaseOrder[],
    );
    const openPoCount = openPos.length;
    const openPoValue = this.round(openPos.reduce((s, p) => s + this.toNum(p.total), 0));

    const spendRows = await this.safe(
      () =>
        this.poRepo.find({
          where: { tenantId, poDate: Between(since12mo, today), status: Not(PoStatus.CANCELLED) },
          select: ['total'],
        }),
      [] as PurchaseOrder[],
    );
    const totalSpend12mo = this.round(spendRows.reduce((s, p) => s + this.toNum(p.total), 0));
    const avgPoValue = this.round(spendRows.length > 0 ? totalSpend12mo / spendRows.length : 0);

    const openBills = await this.safe(
      () =>
        this.billRepo.find({
          where: { tenantId, status: In([BillStatus.OPEN, BillStatus.PARTIAL]) },
          select: ['balanceDue', 'dueDate'],
        }),
      [] as Bill[],
    );
    const payablesOutstanding = this.round(
      openBills.reduce((s, b) => s + this.toNum(b.balanceDue), 0),
    );
    const overduePayables = this.round(
      openBills
        .filter((b) => b.dueDate && b.dueDate < today)
        .reduce((s, b) => s + this.toNum(b.balanceDue), 0),
    );

    return {
      openPoCount,
      openPoValue,
      totalSpend12mo,
      avgPoValue,
      payablesOutstanding,
      overduePayables,
    };
  }

  // ── Order-to-Cash ────────────────────────────────────────────────────────────
  async orderToCash(tenantId: string) {
    const since12mo = this.isoDaysAgo(365);
    const today = this.isoDaysAgo(0);
    const openSoStatuses = [
      SalesOrderStatus.CONFIRMED,
      SalesOrderStatus.IN_PROGRESS,
      SalesOrderStatus.SHIPPED,
    ];

    const openSos = await this.safe(
      () =>
        this.soRepo.find({ where: { tenantId, status: In(openSoStatuses) }, select: ['total'] }),
      [] as SalesOrder[],
    );
    const openOrders = openSos.length;
    const openOrderValue = this.round(openSos.reduce((s, o) => s + this.toNum(o.total), 0));

    // Revenue: prefer posted/sent invoices in last 12mo; fall back to completed orders.
    const revenue12mo = await this.safe(async () => {
      const invs = await this.invoiceRepo.find({
        where: {
          tenantId,
          invoiceDate: Between(since12mo, today),
          status: Not(In([InvoiceStatus.DRAFT, InvoiceStatus.VOID]) as any),
        },
        select: ['total'],
      });
      if (invs.length) return this.round(invs.reduce((s, i) => s + this.toNum(i.total), 0));
      const orders = await this.soRepo.find({
        where: { tenantId, orderDate: Between(since12mo, today), status: SalesOrderStatus.COMPLETED },
        select: ['total'],
      });
      return this.round(orders.reduce((s, o) => s + this.toNum(o.total), 0));
    }, 0);

    const openInvoices = await this.safe(
      () =>
        this.invoiceRepo.find({
          where: {
            tenantId,
            status: Not(In([InvoiceStatus.DRAFT, InvoiceStatus.PAID, InvoiceStatus.VOID]) as any),
          },
          select: ['balanceDue', 'dueDate'],
        }),
      [] as Invoice[],
    );
    const receivablesOutstanding = this.round(
      openInvoices.reduce((s, i) => s + this.toNum(i.balanceDue), 0),
    );
    const overdueReceivables = this.round(
      openInvoices
        .filter((i) => i.dueDate && i.dueDate < today)
        .reduce((s, i) => s + this.toNum(i.balanceDue), 0),
    );

    const dso = this.round(
      revenue12mo > 0 ? receivablesOutstanding / (revenue12mo / 365) : 0,
      1,
    );

    // Collections effectiveness: collections / (collections + ending receivables).
    const collections12mo = await this.safe(async () => {
      const receipts = await this.receiptRepo.find({
        where: { tenantId, receiptDate: Between(since12mo, today) },
        select: ['amount'],
      });
      return this.round(receipts.reduce((s, r) => s + this.toNum(r.amount), 0));
    }, 0);
    const denom = collections12mo + receivablesOutstanding;
    const collectionsEffectivenessPct = this.round(
      denom > 0 ? (collections12mo / denom) * 100 : 0,
    );

    return {
      openOrders,
      openOrderValue,
      revenue12mo,
      receivablesOutstanding,
      overdueReceivables,
      dso,
      collectionsEffectivenessPct,
    };
  }

  // ── Finance Health (approximate) ─────────────────────────────────────────────
  async financeRatios(tenantId: string) {
    // Best-effort: derive current asset / liability proxies from GL account
    // balances by type; if GL data is unavailable, fall back to AR/AP outstanding.
    let currentAssetsProxy = 0;
    let currentLiabilitiesProxy = 0;
    let source: 'gl' | 'ar_ap' = 'ar_ap';

    const glResult = await this.safe(async () => {
      const accounts = await this.accountRepo.find({
        where: { tenantId, type: In([AccountType.ASSET, AccountType.LIABILITY]) },
        select: ['id', 'type'],
      });
      if (!accounts.length) return null;
      const assetIds = accounts.filter((a) => a.type === AccountType.ASSET).map((a) => a.id);
      const liabIds = accounts.filter((a) => a.type === AccountType.LIABILITY).map((a) => a.id);

      const sumBalance = async (ids: string[], normal: 'debit' | 'credit'): Promise<number> => {
        if (!ids.length) return 0;
        const rows = await this.journalLineRepo.find({
          where: { tenantId, accountId: In(ids) },
          select: ['debit', 'credit'],
        });
        return rows.reduce((s, r) => {
          const debit = this.toNum(r.debit);
          const credit = this.toNum(r.credit);
          return s + (normal === 'debit' ? debit - credit : credit - debit);
        }, 0);
      };

      const assets = await sumBalance(assetIds, 'debit');
      const liabs = await sumBalance(liabIds, 'credit');
      if (assets === 0 && liabs === 0) return null;
      return { assets, liabs };
    }, null as { assets: number; liabs: number } | null);

    if (glResult) {
      currentAssetsProxy = this.round(glResult.assets);
      currentLiabilitiesProxy = this.round(glResult.liabs);
      source = 'gl';
    } else {
      // Fallback: AR outstanding as a current-asset proxy, AP outstanding as current-liability proxy.
      currentAssetsProxy = await this.safe(async () => {
        const invs = await this.invoiceRepo.find({
          where: {
            tenantId,
            status: Not(In([InvoiceStatus.DRAFT, InvoiceStatus.PAID, InvoiceStatus.VOID]) as any),
          },
          select: ['balanceDue'],
        });
        return this.round(invs.reduce((s, i) => s + this.toNum(i.balanceDue), 0));
      }, 0);
      currentLiabilitiesProxy = await this.safe(async () => {
        const bills = await this.billRepo.find({
          where: { tenantId, status: In([BillStatus.OPEN, BillStatus.PARTIAL]) },
          select: ['balanceDue'],
        });
        return this.round(bills.reduce((s, b) => s + this.toNum(b.balanceDue), 0));
      }, 0);
      source = 'ar_ap';
    }

    const workingCapital = this.round(currentAssetsProxy - currentLiabilitiesProxy);
    const currentRatio = this.round(
      currentLiabilitiesProxy > 0 ? currentAssetsProxy / currentLiabilitiesProxy : 0,
    );

    return {
      currentAssetsProxy,
      currentLiabilitiesProxy,
      workingCapital,
      currentRatio,
      approximate: true,
      source,
    };
  }

  // ── Combined summary ─────────────────────────────────────────────────────────
  async summary(tenantId: string) {
    const [hireToRetire, procureToPay, orderToCash, financeRatios] = await Promise.all([
      this.hireToRetire(tenantId),
      this.procureToPay(tenantId),
      this.orderToCash(tenantId),
      this.financeRatios(tenantId),
    ]);
    return {
      hireToRetire,
      procureToPay,
      orderToCash,
      financeRatios,
      generatedAt: new Date().toISOString(),
    };
  }
}
