import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlannedOrder, PlannedOrderStatus, PlannedOrderType } from './entities/planned-order.entity';
import { ProductionOrder, ProductionOrderStatus } from './entities/production-order.entity';
import { WorkCenter } from './entities/work-center.entity';
import { Routing } from './entities/routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { Item } from '../inventory/entities/item.entity';

export type CrpBucket = 'week' | 'month';

export interface CrpLoadContribution {
  source: string; // 'PO' | 'Planned'
  reference: string;
  qty: number;
  loadMinutes: number;
}

export interface CrpCell {
  period: string;
  loadMinutes: number;
  availableMinutes: number;
  utilizationPct: number;
  overloaded: boolean;
  overloadMinutes: number;
}

export interface CrpWorkCenterPlan {
  workCenterId: string;
  workCenterName: string;
  cells: CrpCell[];
  totalLoadMinutes: number;
  totalAvailableMinutes: number;
  utilizationPct: number;
}

export interface CrpResult {
  from: string;
  to: string;
  bucket: CrpBucket;
  periods: string[];
  workCenters: CrpWorkCenterPlan[];
  summary: {
    totalLoadMinutes: number;
    totalAvailableMinutes: number;
    utilizationPct: number;
    overloadedCells: number;
    bottleneckWorkCenters: Array<{ workCenterId: string; workCenterName: string; utilizationPct: number }>;
  };
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class CrpService {
  constructor(
    @InjectRepository(PlannedOrder) private readonly plannedRepo: Repository<PlannedOrder>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(WorkCenter) private readonly wcRepo: Repository<WorkCenter>,
    @InjectRepository(Routing) private readonly routingRepo: Repository<Routing>,
    @InjectRepository(RoutingOperation) private readonly routingOpRepo: Repository<RoutingOperation>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
  ) {}

  // ─── Pure helpers ────────────────────────────────────────────────────────────

  /** Load minutes for one operation across a quantity (setup is once per order). */
  operationLoad(runMinutesPerUnit: number, setupMinutes: number, qty: number): number {
    return round(Number(runMinutesPerUnit) * Number(qty) + Number(setupMinutes));
  }

  /** Available minutes per day for a work center (efficiency-adjusted). */
  dailyCapacity(wc: WorkCenter): number {
    const base = wc.capacityMinutesPerDay ?? Math.round(Number(wc.capacityPerHour ?? 0) * 8 * 60);
    const eff = wc.efficiencyPercent != null ? Number(wc.efficiencyPercent) / 100 : 1;
    return Math.round(base * eff);
  }

  /** Monday (ISO week start) of the week containing the date, as YYYY-MM-DD. */
  weekStart(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  bucketKey(dateStr: string, bucket: CrpBucket): string {
    return bucket === 'month' ? dateStr.slice(0, 7) : this.weekStart(dateStr);
  }

  /** Count weekdays (Mon–Fri) within [from, to] inclusive. */
  weekdaysBetween(from: string, to: string): number {
    const start = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    if (end < start) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getUTCDay();
      if (day !== 0 && day !== 6) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }

  /** Working days attributable to a bucket, clipped to the [from,to] window. */
  private bucketWorkingDays(period: string, bucket: CrpBucket, from: string, to: string): number {
    let bStart: string;
    let bEnd: string;
    if (bucket === 'month') {
      bStart = `${period}-01`;
      const [y, m] = period.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      bEnd = `${period}-${String(last).padStart(2, '0')}`;
    } else {
      bStart = period;
      const d = new Date(period + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 6);
      bEnd = d.toISOString().slice(0, 10);
    }
    const clipStart = bStart < from ? from : bStart;
    const clipEnd = bEnd > to ? to : bEnd;
    return this.weekdaysBetween(clipStart, clipEnd);
  }

  // ─── Routing explosion ─────────────────────────────────────────────────────────

  /** Operations for an item's active routing (falls back to any routing). */
  private async operationsForItem(tenantId: string, itemId: string): Promise<RoutingOperation[]> {
    let routing = await this.routingRepo.findOne({ where: { tenantId, itemId, isActive: true } });
    if (!routing) routing = await this.routingRepo.findOne({ where: { tenantId, itemId } });
    if (!routing) return [];
    return this.routingOpRepo.find({ where: { tenantId, routingId: routing.id }, order: { sequence: 'ASC' } });
  }

  // ─── Capacity plan ───────────────────────────────────────────────────────────────

  async getCapacityPlan(
    tenantId: string,
    opts: { from: string; to: string; bucket?: CrpBucket; includePlanned?: boolean },
  ): Promise<CrpResult> {
    const { from, to } = opts;
    if (!from || !to) throw new BadRequestException('from and to dates are required');
    if (to < from) throw new BadRequestException('`to` must not be before `from`');
    const bucket: CrpBucket = opts.bucket ?? 'week';
    const includePlanned = opts.includePlanned !== false;

    const workCenters = await this.wcRepo.find({ where: { tenantId } });
    const wcById = new Map(workCenters.map((w) => [w.id, w]));
    const items = await this.itemRepo.find({ where: { tenantId } });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const itemByCode = new Map(items.filter((i) => i.code).map((i) => [i.code, i]));

    // wcId -> period -> { load, contributions }
    const load = new Map<string, Map<string, number>>();
    const periodSet = new Set<string>();
    const addLoad = (wcId: string, period: string, minutes: number) => {
      if (!load.has(wcId)) load.set(wcId, new Map());
      const inner = load.get(wcId)!;
      inner.set(period, round((inner.get(period) ?? 0) + minutes));
      periodSet.add(period);
    };

    // Cache routing operations per item to avoid repeated lookups.
    const opCache = new Map<string, RoutingOperation[]>();
    const getOps = async (itemId: string) => {
      if (!opCache.has(itemId)) opCache.set(itemId, await this.operationsForItem(tenantId, itemId));
      return opCache.get(itemId)!;
    };

    // 1) Open production orders → load at their planned start date.
    const openPoStatuses = [
      ProductionOrderStatus.PLANNED,
      ProductionOrderStatus.RELEASED,
      ProductionOrderStatus.IN_PROGRESS,
    ];
    const openOrders = await this.orderRepo.find({ where: { tenantId, status: In(openPoStatuses) } });
    for (const o of openOrders) {
      const date = o.plannedStartDate;
      if (!date || date < from || date > to) continue;
      const remaining = Math.max(0, Number(o.plannedQuantity ?? 0) - Number(o.producedQuantity ?? 0));
      if (remaining <= 0) continue;
      const item = itemByCode.get(o.finishedItemCode);
      const period = this.bucketKey(date, bucket);
      const ops = item ? await getOps(item.id) : [];
      if (ops.length > 0) {
        for (const op of ops) addLoad(op.workCenterId, period, this.operationLoad(op.runMinutesPerUnit, op.setupMinutes, remaining));
      } else if (o.workCenterId) {
        addLoad(o.workCenterId, period, this.dailyCapacity(wcById.get(o.workCenterId) ?? ({} as WorkCenter)) || 0);
      }
    }

    // 2) Planned production orders (MRP output) → load at their due date.
    if (includePlanned) {
      const planned = await this.plannedRepo.find({
        where: { tenantId, status: PlannedOrderStatus.PLANNED, type: PlannedOrderType.PLANNED_PRODUCTION },
      });
      for (const p of planned) {
        const date = p.dueDate;
        if (!date || date < from || date > to) continue;
        const item = itemById.get(p.itemId);
        if (!item) continue;
        const ops = await getOps(item.id);
        if (ops.length === 0) continue;
        const period = this.bucketKey(date, bucket);
        for (const op of ops) addLoad(op.workCenterId, period, this.operationLoad(op.runMinutesPerUnit, op.setupMinutes, Number(p.quantity)));
      }
    }

    const periods = Array.from(periodSet).sort((a, b) => a.localeCompare(b));

    // Build per-work-center cells (only WCs that carry load).
    const wcPlans: CrpWorkCenterPlan[] = [];
    let grandLoad = 0;
    let grandAvail = 0;
    let overloadedCells = 0;

    for (const [wcId, periodMap] of load.entries()) {
      const wc = wcById.get(wcId);
      const dailyCap = wc ? this.dailyCapacity(wc) : 480;
      const cells: CrpCell[] = [];
      let wcLoad = 0;
      let wcAvail = 0;
      for (const period of periods) {
        const loadMinutes = round(periodMap.get(period) ?? 0);
        if (loadMinutes === 0) continue;
        const availableMinutes = dailyCap * this.bucketWorkingDays(period, bucket, from, to);
        const utilizationPct = availableMinutes > 0 ? Math.round((loadMinutes / availableMinutes) * 100) : 999;
        const overloaded = loadMinutes > availableMinutes;
        if (overloaded) overloadedCells++;
        cells.push({
          period,
          loadMinutes,
          availableMinutes,
          utilizationPct,
          overloaded,
          overloadMinutes: overloaded ? round(loadMinutes - availableMinutes) : 0,
        });
        wcLoad += loadMinutes;
        wcAvail += availableMinutes;
      }
      if (cells.length === 0) continue;
      grandLoad += wcLoad;
      grandAvail += wcAvail;
      wcPlans.push({
        workCenterId: wcId,
        workCenterName: wc?.name ?? 'Unknown work center',
        cells,
        totalLoadMinutes: round(wcLoad),
        totalAvailableMinutes: round(wcAvail),
        utilizationPct: wcAvail > 0 ? Math.round((wcLoad / wcAvail) * 100) : 999,
      });
    }

    wcPlans.sort((a, b) => b.utilizationPct - a.utilizationPct);

    return {
      from,
      to,
      bucket,
      periods,
      workCenters: wcPlans,
      summary: {
        totalLoadMinutes: round(grandLoad),
        totalAvailableMinutes: round(grandAvail),
        utilizationPct: grandAvail > 0 ? Math.round((grandLoad / grandAvail) * 100) : 0,
        overloadedCells,
        bottleneckWorkCenters: wcPlans
          .filter((w) => w.utilizationPct > 100)
          .map((w) => ({ workCenterId: w.workCenterId, workCenterName: w.workCenterName, utilizationPct: w.utilizationPct })),
      },
    };
  }
}
