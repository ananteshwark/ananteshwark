import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourcingRule, SourceType } from './entities/sourcing-rule.entity';
import { StockBalance } from '../../inventory/entities/stock-balance.entity';
import { PurchaseOrder, PoStatus } from '../../procurement/po/entities/purchase-order.entity';
import { PoLine } from '../../procurement/po/entities/po-line.entity';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

const OPEN_PO_STATUSES = [
  PoStatus.APPROVED, PoStatus.RELEASED, PoStatus.SENT, PoStatus.PARTIALLY_RECEIVED,
].filter(Boolean) as PoStatus[];

export interface PromiseResult {
  itemId: string;
  requestedQty: number;
  requiredDate: string | null;
  onHand: number;
  available: number;
  promiseDate: string | null; // earliest date the full qty can be promised
  canPromiseByRequiredDate: boolean;
  timeline: Array<{ date: string; supply: number; cumulative: number }>;
  shortfall: number;
}

@Injectable()
export class PromisingService {
  constructor(
    @InjectRepository(SourcingRule) private readonly ruleRepo: Repository<SourcingRule>,
    @InjectRepository(StockBalance) private readonly balanceRepo: Repository<StockBalance>,
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PoLine) private readonly poLineRepo: Repository<PoLine>,
  ) {}

  // ─── Sourcing rules ───────────────────────────────────────────────

  listRules(tenantId: string, itemId?: string): Promise<SourcingRule[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    return this.ruleRepo.find({ where, order: { rank: 'ASC' } });
  }

  async createRule(tenantId: string, data: Partial<SourcingRule>): Promise<SourcingRule> {
    if (!data.sourceType) throw new BadRequestException('sourceType is required');
    if (!data.itemId && !data.itemCategoryId) throw new BadRequestException('itemId or itemCategoryId is required');
    const rule = this.ruleRepo.create({ tenantId, rank: 1, leadTimeDays: 0, allocationPct: 100, isActive: true, ...data } as any) as unknown as SourcingRule;
    return (this.ruleRepo.save(rule) as unknown) as Promise<SourcingRule>;
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (rule) await this.ruleRepo.remove(rule);
  }

  // ─── Ph-150: Global Order Promising ───────────────────────────────

  private addDays(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Date-based ATP: cumulative available = on-hand now + scheduled PO receipts
   * by their delivery date. Returns the earliest date the full quantity is
   * available (promise date) and a per-date supply timeline.
   */
  async promise(tenantId: string, data: {
    itemId: string; itemCode?: string; quantity: number; requiredDate?: string; warehouseId?: string;
  }): Promise<PromiseResult> {
    if (!data.quantity || data.quantity <= 0) throw new BadRequestException('quantity must be > 0');

    // on-hand available now (net of commitments)
    const balWhere: any = { tenantId, itemId: data.itemId };
    if (data.warehouseId) balWhere.warehouseId = data.warehouseId;
    const balances = await this.balanceRepo.find({ where: balWhere });
    const onHand = round4(balances.reduce((s, b) => s + (Number(b.qtyOnHand) - Number(b.committedQty || 0)), 0));

    // scheduled receipts from open POs (match by item code on the PO line)
    let scheduled: Array<{ date: string; qty: number }> = [];
    if (data.itemCode) {
      const openPos = await this.poRepo.find({ where: { tenantId } });
      const openById = new Map(openPos.filter((p) => OPEN_PO_STATUSES.includes(p.status)).map((p) => [p.id, p]));
      const lines = await this.poLineRepo.find({ where: { tenantId, itemCode: data.itemCode } });
      for (const l of lines) {
        const po = openById.get(l.poId);
        if (!po) continue;
        const open = round4(Number(l.quantity) - Number(l.quantityReceived || 0));
        if (open <= 0) continue;
        scheduled.push({ date: po.deliveryDate ?? po.poDate, qty: open });
      }
    }
    scheduled.sort((a, b) => a.date.localeCompare(b.date));

    // build cumulative timeline
    const today = scheduled[0]?.date ?? data.requiredDate ?? '1970-01-01';
    const timeline: Array<{ date: string; supply: number; cumulative: number }> = [];
    let cumulative = onHand;
    timeline.push({ date: today, supply: onHand, cumulative });
    let promiseDate: string | null = cumulative >= data.quantity ? today : null;
    for (const s of scheduled) {
      cumulative = round4(cumulative + s.qty);
      timeline.push({ date: s.date, supply: s.qty, cumulative });
      if (promiseDate === null && cumulative >= data.quantity) promiseDate = s.date;
    }

    const shortfall = round4(Math.max(0, data.quantity - cumulative));
    const canPromiseByRequiredDate = !!promiseDate && (!data.requiredDate || promiseDate <= data.requiredDate);

    return {
      itemId: data.itemId,
      requestedQty: round4(data.quantity),
      requiredDate: data.requiredDate ?? null,
      onHand,
      available: onHand,
      promiseDate,
      canPromiseByRequiredDate,
      timeline,
      shortfall,
    };
  }

  /** Resolve the ranked sourcing plan for an item, applying allocation %. */
  async sourcingPlan(tenantId: string, itemId: string, quantity: number): Promise<any> {
    const rules = (await this.listRules(tenantId, itemId)).filter((r) => r.isActive);
    if (rules.length === 0) {
      return { itemId, quantity, sources: [{ sourceType: SourceType.VENDOR, allocatedQty: quantity, rank: 1, note: 'default (no rules)' }] };
    }
    const sources = rules.map((r) => ({
      sourceType: r.sourceType,
      sourceOrgId: r.sourceOrgId,
      vendorId: r.vendorId,
      rank: r.rank,
      leadTimeDays: r.leadTimeDays,
      allocatedQty: round4((quantity * r.allocationPct) / 100),
    }));
    return { itemId, quantity, sources };
  }
}
