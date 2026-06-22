import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { PlannedOrder, PlannedOrderStatus, PlannedOrderType } from './entities/planned-order.entity';
import { Item } from '../inventory/entities/item.entity';
import { StockBalance } from '../inventory/entities/stock-balance.entity';
import { ProductionOrder, ProductionOrderStatus } from './entities/production-order.entity';
import { SalesOrder, SalesOrderStatus } from '../sales/entities/sales-order.entity';
import { SalesOrderLine, LineStatus } from '../sales/entities/sales-order-line.entity';
import { Bom, BomStatus } from './entities/bom.entity';
import { ManufacturingService } from './manufacturing.service';

@Injectable()
export class MrpService {
  constructor(
    @InjectRepository(PlannedOrder) private readonly plannedRepo: Repository<PlannedOrder>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockBalance) private readonly balanceRepo: Repository<StockBalance>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(SalesOrder) private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly soLineRepo: Repository<SalesOrderLine>,
    @InjectRepository(Bom) private readonly bomRepo: Repository<Bom>,
    private readonly manufacturingService: ManufacturingService,
  ) {}

  private addDays(base: Date, days: number): string {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private async onHandByItemId(tenantId: string): Promise<Map<string, { onHand: number; committed: number }>> {
    const balances = await this.balanceRepo.find({ where: { tenantId } });
    const map = new Map<string, { onHand: number; committed: number }>();
    for (const b of balances) {
      const cur = map.get(b.itemId) ?? { onHand: 0, committed: 0 };
      cur.onHand += Number(b.qtyOnHand ?? 0);
      cur.committed += Number(b.committedQty ?? 0);
      map.set(b.itemId, cur);
    }
    return map;
  }

  async runMrp(tenantId: string, opts: { horizonDays?: number } = {}): Promise<any> {
    const horizonDays = opts.horizonDays ?? 90;
    const today = new Date();
    const horizonDate = this.addDays(today, horizonDays);
    const todayStr = today.toISOString().slice(0, 10);

    // 1) Clear prior un-converted PLANNED orders (keep CONVERTED/CANCELLED history)
    await this.plannedRepo.delete({ tenantId, status: PlannedOrderStatus.PLANNED });

    const items = await this.itemRepo.find({ where: { tenantId, isActive: true } });
    const itemById = new Map(items.map((i) => [i.id, i]));
    const itemByCode = new Map(items.filter((i) => i.code).map((i) => [i.code, i]));

    const onHandMap = await this.onHandByItemId(tenantId);

    // 2) Gather demand by item: open SO lines within horizon
    const demandByItem = new Map<string, number>();
    const demandSource = new Map<string, string[]>();
    const openSoStatuses = [SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS, SalesOrderStatus.DRAFT];
    const openSos = await this.soRepo.find({ where: { tenantId, status: In(openSoStatuses) } });
    const soById = new Map(openSos.map((s) => [s.id, s]));
    if (openSos.length > 0) {
      const lines = await this.soLineRepo.find({
        where: { tenantId, orderId: In(openSos.map((s) => s.id)), status: Not(LineStatus.CANCELLED) },
      });
      for (const line of lines) {
        const so = soById.get(line.orderId);
        if (!so) continue;
        // Restrict to horizon by expected delivery date when present
        if (so.expectedDeliveryDate && so.expectedDeliveryDate > horizonDate) continue;
        let item: Item | undefined;
        if (line.inventoryItemId) item = itemById.get(line.inventoryItemId);
        if (!item && line.itemCode) item = itemByCode.get(line.itemCode);
        if (!item) continue;
        const open = Math.max(0, Number(line.quantity ?? 0) - Number(line.qtyShipped ?? 0));
        if (open <= 0) continue;
        demandByItem.set(item.id, (demandByItem.get(item.id) ?? 0) + open);
        const src = demandSource.get(item.id) ?? [];
        src.push(`SO ${so.orderNumber}`);
        demandSource.set(item.id, src);
      }
    }

    // 3) Open supply = open production orders (for MAKE) by finished item code
    const openPoStatuses = [ProductionOrderStatus.PLANNED, ProductionOrderStatus.RELEASED, ProductionOrderStatus.IN_PROGRESS];
    const openOrders = await this.orderRepo.find({ where: { tenantId, status: In(openPoStatuses) } });
    const openSupplyByItem = new Map<string, number>();
    for (const o of openOrders) {
      const item = itemByCode.get(o.finishedItemCode);
      if (!item) continue;
      const remaining = Math.max(0, Number(o.plannedQuantity ?? 0) - Number(o.producedQuantity ?? 0));
      openSupplyByItem.set(item.id, (openSupplyByItem.get(item.id) ?? 0) + remaining);
    }

    // 4) Items to evaluate: those with demand OR below reorder point
    const candidateIds = new Set<string>(demandByItem.keys());
    for (const item of items) {
      const rp = item.reorderPoint != null ? Number(item.reorderPoint) : (item.reorderLevel != null ? Number(item.reorderLevel) : 0);
      if (rp > 0) candidateIds.add(item.id);
    }

    const created: PlannedOrder[] = [];
    for (const itemId of candidateIds) {
      const item = itemById.get(itemId);
      if (!item) continue;
      const oh = onHandMap.get(itemId) ?? { onHand: 0, committed: 0 };
      const available = oh.onHand - oh.committed;
      const openSupply = openSupplyByItem.get(itemId) ?? 0;
      const demand = demandByItem.get(itemId) ?? 0;
      const reorderPoint = item.reorderPoint != null ? Number(item.reorderPoint) : (item.reorderLevel != null ? Number(item.reorderLevel) : 0);
      const safetyStock = item.safetyStock != null ? Number(item.safetyStock) : 0;

      // Net requirement: demand + safety stock must be covered by available + open supply.
      // Reorder point triggers replenishment when projected available dips below it.
      const projected = available + openSupply - demand;
      const target = Math.max(reorderPoint, safetyStock);
      let shortfall = 0;
      if (projected < target) shortfall = target - projected;
      // If there is explicit demand exceeding supply, ensure it is covered
      const demandShortfall = demand - (available + openSupply);
      if (demandShortfall > shortfall) shortfall = demandShortfall;

      if (shortfall <= 0) continue;

      // Lot sizing
      let qty = shortfall;
      const fixedLot = item.fixedLotSize != null ? Number(item.fixedLotSize) : 0;
      if (fixedLot > 0) qty = Math.ceil(shortfall / fixedLot) * fixedLot;
      else {
        const reorderQty = Number(item.reorderQty ?? 0);
        if (reorderQty > 0 && reorderQty > qty) qty = reorderQty;
      }

      const procurementType = (item.procurementType ?? 'BUY').toUpperCase();
      const isMake = procurementType === 'MAKE';
      const leadDays = item.plannedDeliveryDays != null ? Number(item.plannedDeliveryDays) : 0;
      const dueDate = this.addDays(today, leadDays);

      let exceptionMessage: string | null = null;
      if (dueDate < todayStr) exceptionMessage = 'Due date is in the past — expedite required';

      const planned = await this.plannedRepo.save(
        this.plannedRepo.create({
          tenantId,
          itemId: item.id,
          itemName: item.name,
          type: isMake ? PlannedOrderType.PLANNED_PRODUCTION : PlannedOrderType.PLANNED_PO,
          quantity: Math.round(qty * 10000) / 10000,
          dueDate,
          status: PlannedOrderStatus.PLANNED,
          exceptionMessage,
          sourceDemand: (demandSource.get(item.id) ?? []).join(', ') || (reorderPoint > 0 ? 'Reorder point' : 'Net requirement'),
        }),
      );
      created.push(planned);
    }

    return {
      horizonDays,
      plannedOrdersCreated: created.length,
      plannedProduction: created.filter((p) => p.type === PlannedOrderType.PLANNED_PRODUCTION).length,
      plannedPurchase: created.filter((p) => p.type === PlannedOrderType.PLANNED_PO).length,
      exceptions: created.filter((p) => !!p.exceptionMessage).length,
    };
  }

  async listPlannedOrders(tenantId: string, status?: string): Promise<PlannedOrder[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.plannedRepo.find({ where, order: { dueDate: 'ASC', createdAt: 'DESC' } });
  }

  async convertPlannedOrder(tenantId: string, id: string): Promise<{ plannedOrder: PlannedOrder; productionOrderId?: string; note?: string }> {
    const planned = await this.plannedRepo.findOne({ where: { tenantId, id } });
    if (!planned) throw new NotFoundException(`Planned order ${id} not found`);
    if (planned.status !== PlannedOrderStatus.PLANNED) throw new BadRequestException('Only PLANNED orders can be converted');

    let productionOrderId: string | undefined;
    let note: string | undefined;

    if (planned.type === PlannedOrderType.PLANNED_PRODUCTION) {
      // Find an active BOM for the item to create a draft production order
      const item = await this.itemRepo.findOne({ where: { tenantId, id: planned.itemId } });
      let bom: Bom | null = null;
      if (item) {
        bom = await this.bomRepo.findOne({ where: { tenantId, finishedItemCode: item.code, status: BomStatus.ACTIVE } });
        if (!bom) bom = await this.bomRepo.findOne({ where: { tenantId, finishedItemCode: item.code } });
      }
      if (bom) {
        const order = await this.manufacturingService.createOrder(tenantId, {
          bomId: bom.id,
          plannedQuantity: Number(planned.quantity),
          plannedStartDate: new Date().toISOString().slice(0, 10),
          plannedEndDate: planned.dueDate,
          notes: `Converted from planned order (MRP)`,
        } as any);
        productionOrderId = order.id;
      } else {
        note = 'No BOM found for item — production order not created; planned order marked converted.';
      }
    } else {
      note = 'Planned purchase order marked converted — create a purchase order in Procurement.';
    }

    planned.status = PlannedOrderStatus.CONVERTED;
    await this.plannedRepo.save(planned);
    return { plannedOrder: planned, productionOrderId, note };
  }

  async getStockRequirements(tenantId: string, itemId: string): Promise<any> {
    const item = await this.itemRepo.findOne({ where: { tenantId, id: itemId } });
    if (!item) throw new NotFoundException(`Item ${itemId} not found`);

    const balances = await this.balanceRepo.find({ where: { tenantId, itemId } });
    const onHand = balances.reduce((s, b) => s + Number(b.qtyOnHand ?? 0), 0);
    const committed = balances.reduce((s, b) => s + Number(b.committedQty ?? 0), 0);
    const available = onHand - committed;

    // Open supply from production orders
    const openPoStatuses = [ProductionOrderStatus.PLANNED, ProductionOrderStatus.RELEASED, ProductionOrderStatus.IN_PROGRESS];
    const openOrders = await this.orderRepo.find({ where: { tenantId, finishedItemCode: item.code, status: In(openPoStatuses) } });
    const openSupply = openOrders.reduce((s, o) => s + Math.max(0, Number(o.plannedQuantity ?? 0) - Number(o.producedQuantity ?? 0)), 0);

    // Demand from open SO lines
    const openSoStatuses = [SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS, SalesOrderStatus.DRAFT];
    const openSos = await this.soRepo.find({ where: { tenantId, status: In(openSoStatuses) } });
    let demand = 0;
    if (openSos.length > 0) {
      const lines = await this.soLineRepo.find({
        where: [
          { tenantId, orderId: In(openSos.map((s) => s.id)), inventoryItemId: item.id, status: Not(LineStatus.CANCELLED) },
          { tenantId, orderId: In(openSos.map((s) => s.id)), itemCode: item.code, status: Not(LineStatus.CANCELLED) },
        ],
      });
      for (const line of lines) {
        demand += Math.max(0, Number(line.quantity ?? 0) - Number(line.qtyShipped ?? 0));
      }
    }

    const plannedOrders = await this.plannedRepo.find({ where: { tenantId, itemId, status: PlannedOrderStatus.PLANNED } });
    const plannedSupply = plannedOrders.reduce((s, p) => s + Number(p.quantity ?? 0), 0);

    return {
      item: { id: item.id, code: item.code, name: item.name },
      onHand,
      committed,
      available,
      openSupply,
      demand,
      plannedSupply,
      reorderPoint: item.reorderPoint != null ? Number(item.reorderPoint) : Number(item.reorderLevel ?? 0),
      safetyStock: item.safetyStock != null ? Number(item.safetyStock) : 0,
      projectedAvailable: available + openSupply + plannedSupply - demand,
    };
  }
}
