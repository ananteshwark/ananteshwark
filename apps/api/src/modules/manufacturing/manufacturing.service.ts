import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom, BomLine, BomStatus } from './entities/bom.entity';
import { WorkCenter } from './entities/work-center.entity';
import { ProductionOrder, ProductionOrderStatus, MaterialIssuance } from './entities/production-order.entity';
import { Routing } from './entities/routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { ProductionConfirmation } from './entities/production-confirmation.entity';
import { CostingRun, CostingRunStatus } from './entities/costing-run.entity';
import {
  CreateBomDto, CreateWorkCenterDto, CreateProductionOrderDto,
  CompleteProductionOrderDto, IssueMaterialDto,
  CreateRoutingDto, UpdateRoutingDto, ConfirmOperationDto, SettleOrderDto,
} from './dto/manufacturing.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { GlService } from '../finance/gl/gl.service';
import { JournalSource } from '../finance/gl/entities/journal-entry.entity';
import { InventoryService } from '../inventory/inventory.service';
import { ControllingService } from '../finance/controlling/controlling.service';

@Injectable()
export class ManufacturingService {
  constructor(
    @InjectRepository(Bom) private readonly bomRepo: Repository<Bom>,
    @InjectRepository(BomLine) private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(WorkCenter) private readonly wcRepo: Repository<WorkCenter>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(MaterialIssuance) private readonly issuanceRepo: Repository<MaterialIssuance>,
    @InjectRepository(Routing) private readonly routingRepo: Repository<Routing>,
    @InjectRepository(RoutingOperation) private readonly routingOpRepo: Repository<RoutingOperation>,
    @InjectRepository(ProductionConfirmation) private readonly confirmationRepo: Repository<ProductionConfirmation>,
    @InjectRepository(CostingRun) private readonly costingRunRepo: Repository<CostingRun>,
    private readonly glService: GlService,
    private readonly inventoryService: InventoryService,
    private readonly controllingService: ControllingService,
  ) {}

  // ---- BOMs ----
  private async nextBomNumber(tenantId: string): Promise<string> {
    const row = await this.bomRepo
      .createQueryBuilder('b')
      .select(`MAX(CAST(NULLIF(regexp_replace(b.bom_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('b.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `BOM-${String((row?.mx ?? 0) + 1).padStart(5, '0')}`;
  }

  async createBom(tenantId: string, dto: CreateBomDto): Promise<Bom> {
    const bomNumber = await this.nextBomNumber(tenantId);
    const bom = await this.bomRepo.save(
      this.bomRepo.create({
        ...dto, tenantId, bomNumber,
        outputQuantity: dto.outputQuantity ?? 1,
        outputUom: dto.outputUom ?? 'EA',
        version: dto.version ?? '1.0',
      }),
    );
    const lines = dto.lines.map((l, idx) =>
      this.bomLineRepo.create({ ...l, tenantId, bomId: bom.id, lineNumber: idx + 1 }),
    );
    await this.bomLineRepo.save(lines);
    return bom;
  }

  async listBoms(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Bom>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.bomRepo.findAndCount({
      where: { tenantId }, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getBom(tenantId: string, id: string): Promise<{ bom: Bom; lines: BomLine[] }> {
    const bom = await this.bomRepo.findOne({ where: { tenantId, id } });
    if (!bom) throw new NotFoundException(`BOM ${id} not found`);
    const lines = await this.bomLineRepo.find({ where: { tenantId, bomId: id }, order: { lineNumber: 'ASC' } });
    return { bom, lines };
  }

  async activateBom(tenantId: string, id: string): Promise<Bom> {
    const bom = await this.bomRepo.findOne({ where: { tenantId, id } });
    if (!bom) throw new NotFoundException(`BOM ${id} not found`);
    bom.status = BomStatus.ACTIVE;
    return this.bomRepo.save(bom);
  }

  // ---- Work Centers ----
  async createWorkCenter(tenantId: string, dto: CreateWorkCenterDto): Promise<WorkCenter> {
    const existing = await this.wcRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Work center code ${dto.code} already exists`);
    return this.wcRepo.save(this.wcRepo.create({ ...dto, tenantId }));
  }

  async listWorkCenters(tenantId: string): Promise<WorkCenter[]> {
    return this.wcRepo.find({ where: { tenantId, isActive: true }, order: { code: 'ASC' } });
  }

  // ---- Production Orders ----
  private async nextOrderNumber(tenantId: string): Promise<string> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .select(`MAX(CAST(NULLIF(regexp_replace(o.order_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('o.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `PO-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createOrder(tenantId: string, dto: CreateProductionOrderDto): Promise<ProductionOrder> {
    const { bom } = await this.getBom(tenantId, dto.bomId);
    const orderNumber = await this.nextOrderNumber(tenantId);
    return this.orderRepo.save(
      this.orderRepo.create({
        ...dto, tenantId, orderNumber,
        finishedItemCode: bom.finishedItemCode,
        finishedItemName: bom.finishedItemName,
        uom: bom.outputUom,
        producedQuantity: 0,
        scrapQuantity: 0,
      }),
    );
  }

  async listOrders(tenantId: string, pagination: PaginationDto, status?: string): Promise<PaginatedResponseDto<ProductionOrder>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.orderRepo.createQueryBuilder('o').where('o.tenantId = :tenantId', { tenantId });
    if (status) qb.andWhere('o.status = :status', { status });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async releaseOrder(tenantId: string, id: string): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id } });
    if (!order) throw new NotFoundException(`Production order ${id} not found`);
    if (order.status !== ProductionOrderStatus.PLANNED) throw new BadRequestException('Only PLANNED orders can be released');
    order.status = ProductionOrderStatus.RELEASED;
    order.actualStartDate = new Date().toISOString().slice(0, 10);
    return this.orderRepo.save(order);
  }

  async completeOrder(tenantId: string, id: string, dto: CompleteProductionOrderDto, userId: string): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id } });
    if (!order) throw new NotFoundException(`Production order ${id} not found`);
    if (![ProductionOrderStatus.RELEASED, ProductionOrderStatus.IN_PROGRESS].includes(order.status)) {
      throw new BadRequestException('Order must be RELEASED or IN_PROGRESS to complete');
    }
    order.producedQuantity = dto.producedQuantity;
    order.scrapQuantity = dto.scrapQuantity ?? 0;
    order.actualEndDate = dto.actualEndDate;
    order.status = ProductionOrderStatus.COMPLETED;

    // Best-effort GL posting: WIP → Finished Goods, COGS for scrap
    try {
      const wipAccounts = await this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: 'WIP' });
      const fgAccounts = await this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: 'finished goods' });
      if (wipAccounts.items.length > 0 && fgAccounts.items.length > 0) {
        const wipAccountId = wipAccounts.items[0].id;
        const fgAccountId = fgAccounts.items[0].id;
        // Use a nominal transfer amount (production cost estimation would require costing engine)
        const transferAmount = dto.producedQuantity;
        await this.glService.postJournalEntry(tenantId, {
          date: dto.actualEndDate,
          description: `Production order completion: ${order.orderNumber}`,
          source: JournalSource.SYSTEM,
          currency: 'USD',
          lines: [
            { accountId: fgAccountId, debit: transferAmount, credit: 0, description: `Finished goods: ${order.finishedItemName}` },
            { accountId: wipAccountId, debit: 0, credit: transferAmount, description: `WIP transfer: ${order.orderNumber}` },
          ],
        }, userId);
      }
    } catch (_) {
      // GL posting is best-effort
    }

    return this.orderRepo.save(order);
  }

  async issueMaterial(tenantId: string, orderId: string, dto: IssueMaterialDto): Promise<MaterialIssuance> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: orderId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);
    if (order.status === ProductionOrderStatus.COMPLETED || order.status === ProductionOrderStatus.CANCELLED) {
      throw new BadRequestException('Cannot issue material to a completed or cancelled order');
    }
    if (order.status === ProductionOrderStatus.RELEASED) {
      order.status = ProductionOrderStatus.IN_PROGRESS;
      await this.orderRepo.save(order);
    }
    const saved = await this.issuanceRepo.save(
      this.issuanceRepo.create({
        ...dto,
        tenantId,
        productionOrderId: orderId,
        issuedDate: dto.issuedDate ?? new Date().toISOString().slice(0, 10),
        uom: dto.uom ?? 'EA',
      }),
    );

    // Best-effort: deduct stock from inventory when the item exists there,
    // and accumulate actual material cost on the production order (Phase 48).
    try {
      const item = await this.inventoryService.findItemByCode(tenantId, dto.componentCode);
      if (item) {
        const balance = await this.inventoryService.findBestBalanceForItem(tenantId, item.id);
        let unitCost = Number(item.standardCost ?? 0);
        if (balance) {
          unitCost = Number(balance.unitCost ?? balance.avgCost ?? unitCost);
          if (balance.qtyOnHand >= dto.issuedQuantity) {
            await this.inventoryService.issueStock(
              tenantId,
              item.id,
              balance.warehouseId,
              dto.issuedQuantity,
              'PRODUCTION_ORDER',
              orderId,
              saved.issuedDate,
              `Material issuance for ${order.orderNumber}`,
            );
          }
        }
        const issuedCost = unitCost * Number(dto.issuedQuantity);
        order.actualMaterialCost = Number(order.actualMaterialCost ?? 0) + issuedCost;
        order.wipBalance = Number(order.wipBalance ?? 0) + issuedCost;
        await this.orderRepo.save(order);
      }
    } catch (_) {
      // Non-blocking: issuance is recorded even if inventory deduction fails
    }

    return saved;
  }

  async getIssuances(tenantId: string, orderId: string): Promise<MaterialIssuance[]> {
    return this.issuanceRepo.find({ where: { tenantId, productionOrderId: orderId } });
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 46 — Routing & Capacity
  // ════════════════════════════════════════════════════════════════
  async listRoutings(tenantId: string): Promise<Array<Routing & { operations: RoutingOperation[] }>> {
    const routings = await this.routingRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
    const result: Array<Routing & { operations: RoutingOperation[] }> = [];
    for (const r of routings) {
      const operations = await this.routingOpRepo.find({ where: { tenantId, routingId: r.id }, order: { sequence: 'ASC' } });
      result.push(Object.assign(r, { operations }));
    }
    return result;
  }

  async createRouting(tenantId: string, dto: CreateRoutingDto): Promise<Routing & { operations: RoutingOperation[] }> {
    const routing = await this.routingRepo.save(
      this.routingRepo.create({
        tenantId,
        itemId: dto.itemId,
        version: dto.version ?? '1.0',
        isActive: dto.isActive ?? true,
        description: dto.description ?? null,
      }),
    );
    const operations = await this.routingOpRepo.save(
      (dto.operations ?? []).map((op) =>
        this.routingOpRepo.create({
          tenantId,
          routingId: routing.id,
          sequence: op.sequence,
          workCenterId: op.workCenterId,
          description: op.description ?? null,
          setupMinutes: op.setupMinutes ?? 0,
          runMinutesPerUnit: op.runMinutesPerUnit ?? 0,
          yieldPercent: op.yieldPercent ?? 100,
        }),
      ),
    );
    return Object.assign(routing, { operations });
  }

  async updateRouting(tenantId: string, id: string, dto: UpdateRoutingDto): Promise<Routing & { operations: RoutingOperation[] }> {
    const routing = await this.routingRepo.findOne({ where: { tenantId, id } });
    if (!routing) throw new NotFoundException(`Routing ${id} not found`);
    if (dto.itemId !== undefined) routing.itemId = dto.itemId;
    if (dto.version !== undefined) routing.version = dto.version;
    if (dto.isActive !== undefined) routing.isActive = dto.isActive;
    if (dto.description !== undefined) routing.description = dto.description ?? null;
    await this.routingRepo.save(routing);

    // Replace operations when provided
    if (dto.operations !== undefined) {
      await this.routingOpRepo.delete({ tenantId, routingId: id });
      await this.routingOpRepo.save(
        dto.operations.map((op) =>
          this.routingOpRepo.create({
            tenantId,
            routingId: id,
            sequence: op.sequence,
            workCenterId: op.workCenterId,
            description: op.description ?? null,
            setupMinutes: op.setupMinutes ?? 0,
            runMinutesPerUnit: op.runMinutesPerUnit ?? 0,
            yieldPercent: op.yieldPercent ?? 100,
          }),
        ),
      );
    }
    const operations = await this.routingOpRepo.find({ where: { tenantId, routingId: id }, order: { sequence: 'ASC' } });
    return Object.assign(routing, { operations });
  }

  /**
   * Best-effort capacity load: per work center, available minutes (capacity × days)
   * vs scheduled minutes derived from open production orders × routing run minutes.
   */
  async getCapacityLoad(tenantId: string, fromDate?: string, toDate?: string): Promise<any[]> {
    const today = new Date().toISOString().slice(0, 10);
    const from = fromDate ?? today;
    const to = toDate ?? today;
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);

    const workCenters = await this.wcRepo.find({ where: { tenantId, isActive: true }, order: { code: 'ASC' } });

    // Open production orders within window (best-effort: PLANNED/RELEASED/IN_PROGRESS)
    const openStatuses = [ProductionOrderStatus.PLANNED, ProductionOrderStatus.RELEASED, ProductionOrderStatus.IN_PROGRESS];
    const orders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.tenantId = :tenantId', { tenantId })
      .andWhere('o.status IN (:...statuses)', { statuses: openStatuses })
      .getMany();

    // Map item -> active routing operations for scheduling estimation
    const allRoutings = await this.routingRepo.find({ where: { tenantId, isActive: true } });
    const opsByRouting = new Map<string, RoutingOperation[]>();
    for (const r of allRoutings) {
      opsByRouting.set(r.id, await this.routingOpRepo.find({ where: { tenantId, routingId: r.id } }));
    }
    // routing by finished item code (resolved via BOM finishedItemCode -> item)
    const scheduledByWc = new Map<string, number>();
    for (const order of orders) {
      const remainingQty = Math.max(0, Number(order.plannedQuantity ?? 0) - Number(order.producedQuantity ?? 0));
      if (remainingQty <= 0) continue;
      // Find a routing matching the finished item via item lookup
      let routingOps: RoutingOperation[] = [];
      try {
        const item = await this.inventoryService.findItemByCode(tenantId, order.finishedItemCode);
        if (item) {
          const routing = allRoutings.find((r) => r.itemId === item.id);
          if (routing) routingOps = opsByRouting.get(routing.id) ?? [];
        }
      } catch (_) { /* ignore */ }
      for (const op of routingOps) {
        const minutes = Number(op.setupMinutes ?? 0) + Number(op.runMinutesPerUnit ?? 0) * remainingQty;
        scheduledByWc.set(op.workCenterId, (scheduledByWc.get(op.workCenterId) ?? 0) + minutes);
      }
    }

    return workCenters.map((wc) => {
      const capacityPerDay = wc.capacityMinutesPerDay ?? Number(wc.capacityPerHour ?? 0) * 60 * 8;
      const efficiency = wc.efficiencyPercent != null ? Number(wc.efficiencyPercent) / 100 : 1;
      const availableMinutes = Math.round(capacityPerDay * days * efficiency);
      const scheduledMinutes = Math.round(scheduledByWc.get(wc.id) ?? 0);
      return {
        workCenterId: wc.id,
        code: wc.code,
        name: wc.name,
        availableMinutes,
        scheduledMinutes,
        loadPercent: availableMinutes > 0 ? Math.round((scheduledMinutes / availableMinutes) * 100) : 0,
        overloaded: scheduledMinutes > availableMinutes,
      };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 48 — Production Order Costing
  // ════════════════════════════════════════════════════════════════
  private async resolveItemUnitCost(tenantId: string, code: string): Promise<number> {
    try {
      const item = await this.inventoryService.findItemByCode(tenantId, code);
      if (!item) return 0;
      if (Number(item.standardCost ?? 0) > 0) return Number(item.standardCost);
      const balance = await this.inventoryService.findBestBalanceForItem(tenantId, item.id);
      if (balance) return Number(balance.unitCost ?? balance.avgCost ?? 0);
      return 0;
    } catch (_) {
      return 0;
    }
  }

  async calculatePlannedCost(tenantId: string, orderId: string): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: orderId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);
    const qty = Number(order.plannedQuantity ?? 0);

    // Material cost from BOM components × item cost
    const { bom, lines } = await this.getBom(tenantId, order.bomId);
    const outputQty = Number(bom.outputQuantity ?? 1) || 1;
    let materialCost = 0;
    for (const line of lines) {
      const unitCost = await this.resolveItemUnitCost(tenantId, line.componentCode);
      const scrapFactor = 1 + Number(line.scrapPct ?? 0) / 100;
      const perFinished = (Number(line.quantity ?? 0) / outputQty) * scrapFactor;
      materialCost += unitCost * perFinished * qty;
    }

    // Labor cost from routing ops × work center labor rate
    let laborCost = 0;
    try {
      const item = await this.inventoryService.findItemByCode(tenantId, order.finishedItemCode);
      if (item) {
        const routing = await this.routingRepo.findOne({ where: { tenantId, itemId: item.id, isActive: true } });
        if (routing) {
          const ops = await this.routingOpRepo.find({ where: { tenantId, routingId: routing.id } });
          for (const op of ops) {
            const wc = await this.wcRepo.findOne({ where: { tenantId, id: op.workCenterId } });
            const ratePerMinute = Number(wc?.costPerHour ?? 0) / 60;
            const minutes = Number(op.setupMinutes ?? 0) + Number(op.runMinutesPerUnit ?? 0) * qty;
            laborCost += minutes * ratePerMinute;
          }
        }
      }
    } catch (_) { /* ignore */ }

    order.plannedMaterialCost = Math.round(materialCost * 100) / 100;
    order.plannedLaborCost = Math.round(laborCost * 100) / 100;
    return this.orderRepo.save(order);
  }

  async confirmOperation(tenantId: string, orderId: string, dto: ConfirmOperationDto): Promise<ProductionConfirmation> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: orderId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);

    const confirmation = await this.confirmationRepo.save(
      this.confirmationRepo.create({
        tenantId,
        productionOrderId: orderId,
        operationSequence: dto.operationSequence ?? null,
        workCenterId: dto.workCenterId ?? null,
        confirmedQty: dto.confirmedQty,
        actualMinutes: dto.actualMinutes,
        confirmationDate: dto.confirmationDate ?? new Date().toISOString().slice(0, 10),
      }),
    );

    // Accumulate actual labor cost using the work center rate
    let ratePerMinute = 0;
    if (dto.workCenterId) {
      const wc = await this.wcRepo.findOne({ where: { tenantId, id: dto.workCenterId } });
      ratePerMinute = Number(wc?.costPerHour ?? 0) / 60;
    }
    const laborCost = Number(dto.actualMinutes) * ratePerMinute;
    order.actualLaborCost = Number(order.actualLaborCost ?? 0) + laborCost;
    order.wipBalance = Number(order.wipBalance ?? 0) + laborCost;

    // If routing operation has an activity type, post CO activity confirmation
    if (dto.operationSequence && dto.workCenterId) {
      const routing = await this.routingRepo.findOne({ where: { tenantId } });
      if (routing) {
        const op = await this.routingOpRepo.findOne({
          where: { tenantId, routingId: routing.id, sequence: dto.operationSequence },
        });
        if (op?.activityTypeId) {
          const actType = await this.controllingService.findActivityTypeById(tenantId, op.activityTypeId);
          if (actType?.costCenterId) {
            await this.controllingService.confirmActivity(tenantId, {
              activityTypeId: op.activityTypeId,
              costCenterId: actType.costCenterId,
              productionOrderId: orderId,
              qty: Number(dto.confirmedQty),
              confirmationDate: dto.confirmationDate ?? new Date().toISOString().slice(0, 10),
            });
          }
        }
      }
    }

    await this.orderRepo.save(order);

    return confirmation;
  }

  async settleOrder(tenantId: string, orderId: string, _dto?: SettleOrderDto): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: orderId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);
    if (order.costStatus === 'SETTLED') throw new BadRequestException('Order already settled');

    const plannedMaterial = Number(order.plannedMaterialCost ?? 0);
    const plannedLabor = Number(order.plannedLaborCost ?? 0);
    const actualMaterial = Number(order.actualMaterialCost ?? 0);
    const actualLabor = Number(order.actualLaborCost ?? 0);

    order.materialVariance = Math.round((actualMaterial - plannedMaterial) * 100) / 100;
    order.laborVariance = Math.round((actualLabor - plannedLabor) * 100) / 100;
    order.costStatus = 'SETTLED';
    order.wipBalance = 0;
    return this.orderRepo.save(order);
  }

  async getCostSheet(tenantId: string, orderId: string): Promise<any> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: orderId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);
    const issuances = await this.issuanceRepo.find({ where: { tenantId, productionOrderId: orderId } });
    const confirmations = await this.confirmationRepo.find({ where: { tenantId, productionOrderId: orderId } });

    const plannedMaterial = Number(order.plannedMaterialCost ?? 0);
    const plannedLabor = Number(order.plannedLaborCost ?? 0);
    const actualMaterial = Number(order.actualMaterialCost ?? 0);
    const actualLabor = Number(order.actualLaborCost ?? 0);

    return {
      order,
      planned: {
        materialCost: plannedMaterial,
        laborCost: plannedLabor,
        totalCost: Math.round((plannedMaterial + plannedLabor) * 100) / 100,
      },
      actual: {
        materialCost: actualMaterial,
        laborCost: actualLabor,
        totalCost: Math.round((actualMaterial + actualLabor) * 100) / 100,
      },
      variance: {
        material: order.materialVariance ?? Math.round((actualMaterial - plannedMaterial) * 100) / 100,
        labor: order.laborVariance ?? Math.round((actualLabor - plannedLabor) * 100) / 100,
      },
      wipBalance: Number(order.wipBalance ?? 0),
      costStatus: order.costStatus,
      issuances,
      confirmations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 70 — BOM Standard Cost Roll-up
  // ════════════════════════════════════════════════════════════════

  private async rollupBomMaterialCost(
    tenantId: string,
    bomId: string,
    outputQty: number,
    depth = 0,
  ): Promise<{ total: number; lines: Array<{ componentCode: string; qty: number; unitCost: number; lineCost: number }> }> {
    if (depth > 10) return { total: 0, lines: [] };
    const lines = await this.bomLineRepo.find({ where: { tenantId, bomId }, order: { lineNumber: 'ASC' } });
    let total = 0;
    const breakdown: Array<{ componentCode: string; qty: number; unitCost: number; lineCost: number }> = [];

    for (const line of lines) {
      const scrapFactor = 1 + Number(line.scrapPct ?? 0) / 100;
      const qtyPerUnit = (Number(line.quantity ?? 0) / outputQty) * scrapFactor;
      let unitCost = 0;

      // Phantom BOM: recurse into sub-BOM
      if (line.isPhantom && line.subBomId) {
        const subBom = await this.bomRepo.findOne({ where: { tenantId, id: line.subBomId } });
        if (subBom) {
          const subResult = await this.rollupBomMaterialCost(tenantId, line.subBomId, Number(subBom.outputQuantity || 1), depth + 1);
          unitCost = subResult.total;
        }
      } else {
        unitCost = await this.resolveItemUnitCost(tenantId, line.componentCode);
      }

      const lineCost = unitCost * qtyPerUnit;
      total += lineCost;
      breakdown.push({ componentCode: line.componentCode, qty: qtyPerUnit, unitCost, lineCost });
    }

    return { total, lines: breakdown };
  }

  async rollupStandardCost(tenantId: string, bomId: string, runDate?: string): Promise<CostingRun> {
    const bom = await this.bomRepo.findOne({ where: { tenantId, id: bomId } });
    if (!bom) throw new NotFoundException(`BOM ${bomId} not found`);

    const txDate = runDate ?? new Date().toISOString().slice(0, 10);
    let materialCost = 0;
    let laborCost = 0;
    let costBreakdown: Record<string, unknown> = {};
    let errorMessage: string | null = null;
    let status = CostingRunStatus.COMPLETED;

    try {
      const outputQty = Number(bom.outputQuantity || 1);
      const matResult = await this.rollupBomMaterialCost(tenantId, bomId, outputQty);
      materialCost = matResult.total;

      // Labor: routing operations × work center rate / output qty
      const finishedItem = await this.inventoryService.findItemByCode(tenantId, bom.finishedItemCode);
      if (finishedItem) {
        const routing = await this.routingRepo.findOne({ where: { tenantId, itemId: finishedItem.id, isActive: true } });
        if (routing) {
          const ops = await this.routingOpRepo.find({ where: { tenantId, routingId: routing.id } });
          const laborLines: Array<{ operation: number; workCenterId: string; minutes: number; cost: number }> = [];
          for (const op of ops) {
            const wc = await this.wcRepo.findOne({ where: { tenantId, id: op.workCenterId } });
            const ratePerMinute = Number(wc?.costPerHour ?? 0) / 60;
            const minutesPerUnit = (Number(op.setupMinutes ?? 0) / outputQty) + Number(op.runMinutesPerUnit ?? 0);
            const opCost = minutesPerUnit * ratePerMinute;
            laborCost += opCost;
            laborLines.push({ operation: op.sequence, workCenterId: op.workCenterId, minutes: minutesPerUnit, cost: opCost });
          }
          costBreakdown = { materialLines: matResult.lines, laborLines };
        } else {
          costBreakdown = { materialLines: matResult.lines };
        }
      } else {
        costBreakdown = { materialLines: matResult.lines };
      }

      const totalCost = materialCost + laborCost;

      // Retrieve previous standard cost and update item
      let previousStandardCost: number | null = null;
      if (finishedItem) {
        previousStandardCost = Number(finishedItem.standardCost ?? 0);
        finishedItem.standardCost = Math.round(totalCost * 10000) / 10000;
        await this.inventoryService.updateItem(tenantId, finishedItem.id, { standardCost: finishedItem.standardCost });
      }

      return this.costingRunRepo.save(
        this.costingRunRepo.create({
          tenantId,
          bomId,
          finishedItemCode: bom.finishedItemCode,
          status,
          runDate: txDate,
          materialCost: Math.round(materialCost * 10000) / 10000,
          laborCost: Math.round(laborCost * 10000) / 10000,
          overheadCost: 0,
          totalCost: Math.round((materialCost + laborCost) * 10000) / 10000,
          previousStandardCost,
          costBreakdown,
          errorMessage: null,
        }),
      );
    } catch (err: any) {
      errorMessage = err?.message ?? 'Unknown error';
      status = CostingRunStatus.FAILED;
      return this.costingRunRepo.save(
        this.costingRunRepo.create({
          tenantId,
          bomId,
          finishedItemCode: bom.finishedItemCode,
          status,
          runDate: txDate,
          materialCost: 0,
          laborCost: 0,
          overheadCost: 0,
          totalCost: 0,
          previousStandardCost: null,
          costBreakdown: null,
          errorMessage,
        }),
      );
    }
  }

  async listCostingRuns(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<CostingRun>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.costingRunRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }
}
