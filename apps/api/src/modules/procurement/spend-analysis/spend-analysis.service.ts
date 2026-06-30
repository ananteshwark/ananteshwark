import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SpendSummary } from './entities/spend-summary.entity';
import { SavingsRecord, SavingsSource } from './entities/savings-record.entity';
import { PurchaseOrder, PoStatus } from '../po/entities/purchase-order.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const periodOf = (d: string | Date) => {
  const dt = typeof d === 'string' ? d : d.toISOString();
  return dt.slice(0, 7);
};

// POs in these statuses represent committed spend.
const COMMITTED = new Set<PoStatus>([
  PoStatus.APPROVED, PoStatus.RELEASED, PoStatus.SENT, PoStatus.PARTIALLY_RECEIVED,
  PoStatus.RECEIVED, PoStatus.INVOICED, PoStatus.CLOSED,
]);

@Injectable()
export class SpendAnalysisService {
  constructor(
    @InjectRepository(SpendSummary) private readonly summaryRepo: Repository<SpendSummary>,
    @InjectRepository(SavingsRecord) private readonly savingsRepo: Repository<SavingsRecord>,
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
  ) {}

  // ─── Ph-206: spend cube ───────────────────────────────────────────

  async upsertSpend(tenantId: string, data: {
    supplierId: string; supplierName?: string; category?: string; costCenter?: string; period: string;
    committedSpend?: number; actualSpend?: number; currency?: string;
  }): Promise<SpendSummary> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    const category = data.category ?? 'UNCATEGORIZED';
    const costCenter = data.costCenter ?? 'UNASSIGNED';
    let row = await this.summaryRepo.findOne({ where: { tenantId, supplierId: data.supplierId, category, costCenter, period: data.period } });
    if (row) {
      row.committedSpend = round2(Number(row.committedSpend) + (data.committedSpend ?? 0));
      row.actualSpend = round2(Number(row.actualSpend) + (data.actualSpend ?? 0));
      if (data.supplierName) row.supplierName = data.supplierName;
    } else {
      row = this.summaryRepo.create({
        tenantId, supplierId: data.supplierId, supplierName: data.supplierName ?? null, category, costCenter,
        period: data.period, committedSpend: data.committedSpend ?? 0, actualSpend: data.actualSpend ?? 0,
        currency: data.currency ?? 'INR',
      } as any) as unknown as SpendSummary;
    }
    return (this.summaryRepo.save(row) as unknown) as Promise<SpendSummary>;
  }

  /** Rebuild committed spend from approved+ POs, bucketed by supplier × period. */
  async rebuildFromPurchaseOrders(tenantId: string): Promise<{ rebuilt: number }> {
    const pos = await this.poRepo.find({ where: { tenantId } });
    const committed = pos.filter((p) => COMMITTED.has(p.status));
    // Clear prior PO-sourced committed figures by zeroing UNCATEGORIZED/UNASSIGNED cells.
    const buckets = new Map<string, SpendSummary>();
    for (const po of committed) {
      const period = periodOf(po.poDate);
      const key = `${po.vendorId}|${period}`;
      let row = buckets.get(key);
      if (!row) {
        row = await this.summaryRepo.findOne({ where: { tenantId, supplierId: po.vendorId, category: 'UNCATEGORIZED', costCenter: 'UNASSIGNED', period } })
          ?? (this.summaryRepo.create({ tenantId, supplierId: po.vendorId, supplierName: po.vendorName, category: 'UNCATEGORIZED', costCenter: 'UNASSIGNED', period, committedSpend: 0, actualSpend: 0, currency: po.currency } as any) as unknown as SpendSummary);
        row.committedSpend = 0; // reset before re-summing this rebuild
        buckets.set(key, row);
      }
      row.committedSpend = round2(Number(row.committedSpend) + Number(po.total));
      row.supplierName = po.vendorName;
    }
    let count = 0;
    for (const row of buckets.values()) { await this.summaryRepo.save(row); count++; }
    return { rebuilt: count };
  }

  /** Aggregate the cube along a chosen dimension. */
  async queryCube(tenantId: string, opts: { groupBy?: 'supplier' | 'category' | 'costCenter' | 'period'; period?: string } = {}): Promise<any> {
    const where: any = { tenantId };
    if (opts.period) where.period = opts.period;
    const rows = await this.summaryRepo.find({ where });
    const dim = opts.groupBy ?? 'supplier';
    const keyOf = (r: SpendSummary) =>
      dim === 'supplier' ? (r.supplierName ?? r.supplierId) :
      dim === 'category' ? r.category :
      dim === 'costCenter' ? r.costCenter : r.period;
    const groups = new Map<string, { key: string; committed: number; actual: number }>();
    let totalCommitted = 0, totalActual = 0;
    for (const r of rows) {
      const k = keyOf(r);
      const g = groups.get(k) ?? { key: k, committed: 0, actual: 0 };
      g.committed = round2(g.committed + Number(r.committedSpend));
      g.actual = round2(g.actual + Number(r.actualSpend));
      groups.set(k, g);
      totalCommitted = round2(totalCommitted + Number(r.committedSpend));
      totalActual = round2(totalActual + Number(r.actualSpend));
    }
    return {
      groupBy: dim, totalCommitted, totalActual,
      groups: Array.from(groups.values()).sort((a, b) => b.committed - a.committed),
    };
  }

  // ─── Ph-207: savings tracking ─────────────────────────────────────

  async logSavings(tenantId: string, data: {
    source?: SavingsSource; refId?: string; supplierId?: string; description?: string;
    marketPrice: number; negotiatedPrice: number; quantity?: number; period: string;
  }): Promise<SavingsRecord> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    const qty = data.quantity ?? 1;
    const savings = round2((Number(data.marketPrice) - Number(data.negotiatedPrice)) * qty);
    const rec = this.savingsRepo.create({
      tenantId, source: data.source ?? SavingsSource.NEGOTIATION, refId: data.refId ?? null,
      supplierId: data.supplierId ?? null, description: data.description ?? null,
      marketPrice: data.marketPrice, negotiatedPrice: data.negotiatedPrice, quantity: qty,
      savingsAmount: savings, period: data.period,
    } as any) as unknown as SavingsRecord;
    return (this.savingsRepo.save(rec) as unknown) as Promise<SavingsRecord>;
  }

  async savingsSummary(tenantId: string, period?: string): Promise<any> {
    const where: any = { tenantId };
    if (period) where.period = period;
    const records = await this.savingsRepo.find({ where, order: { createdAt: 'DESC' } });
    const total = round2(records.reduce((s, r) => s + Number(r.savingsAmount), 0));
    return { period: period ?? 'ALL', count: records.length, totalSavings: total, records };
  }

  // ─── Ph-208: maverick spend detection ─────────────────────────────

  /**
   * Flag committed POs that bypass controls: no linked requisition (no
   * requisition approval) or a vendor not on the approved-vendor list.
   */
  async detectMaverick(tenantId: string, approvedVendorIds: string[] = []): Promise<any> {
    const pos = await this.poRepo.find({ where: { tenantId } });
    const approvedSet = new Set(approvedVendorIds);
    const flagged = pos
      .filter((p) => COMMITTED.has(p.status))
      .map((p) => {
        const reasons: string[] = [];
        if (!p.requisitionId) reasons.push('NO_REQUISITION');
        if (approvedVendorIds.length > 0 && !approvedSet.has(p.vendorId)) reasons.push('UNAPPROVED_VENDOR');
        return reasons.length ? { poId: p.id, poNumber: p.poNumber, vendorId: p.vendorId, vendorName: p.vendorName, total: Number(p.total), reasons } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => b.total - a.total);
    const maverickSpend = round2(flagged.reduce((s, f) => s + f.total, 0));
    return { flaggedCount: flagged.length, maverickSpend, flagged };
  }
}
