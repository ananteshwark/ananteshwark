import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Item } from './entities/item.entity';
import { StockLedger, TransactionType } from './entities/stock-ledger.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { StockAdjustment, AdjustmentStatus } from './entities/stock-adjustment.entity';
import { FifoLayer } from './entities/fifo-layer.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

export const VALUATION_MOVING_AVERAGE = 'MOVING_AVERAGE';
export const VALUATION_FIFO = 'FIFO';
export const VALUATION_STANDARD = 'STANDARD_COST';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(ItemCategory)
    private readonly categoryRepo: Repository<ItemCategory>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
    @InjectRepository(StockBalance)
    private readonly balanceRepo: Repository<StockBalance>,
    @InjectRepository(StockAdjustment)
    private readonly adjustmentRepo: Repository<StockAdjustment>,
    @InjectRepository(FifoLayer)
    private readonly fifoLayerRepo: Repository<FifoLayer>,
  ) {}

  // ─── Warehouse ──────────────────────────────────────────────

  async createWarehouse(tenantId: string, dto: Partial<Warehouse>): Promise<Warehouse> {
    const entity = this.warehouseRepo.create({ ...dto, tenantId });
    return this.warehouseRepo.save(entity);
  }

  async findWarehouses(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<Warehouse>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.warehouseRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findWarehouse(tenantId: string, id: string): Promise<Warehouse> {
    const wh = await this.warehouseRepo.findOne({ where: { id, tenantId } });
    if (!wh) throw new NotFoundException(`Warehouse ${id} not found`);
    return wh;
  }

  async updateWarehouse(tenantId: string, id: string, dto: Partial<Warehouse>): Promise<Warehouse> {
    const wh = await this.findWarehouse(tenantId, id);
    Object.assign(wh, dto);
    return this.warehouseRepo.save(wh);
  }

  // ─── Item Category ───────────────────────────────────────────

  async createCategory(tenantId: string, dto: Partial<ItemCategory>): Promise<ItemCategory> {
    const entity = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(entity);
  }

  async findCategories(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<ItemCategory>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.categoryRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // ─── Items ───────────────────────────────────────────────────

  async createItem(tenantId: string, dto: Partial<Item>): Promise<Item> {
    const entity = this.itemRepo.create({ ...dto, tenantId });
    return this.itemRepo.save(entity);
  }

  async findItems(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { search?: string; type?: string },
  ): Promise<PaginatedResponseDto<Item>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.itemRepo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId });
    if (filters?.search) {
      qb.andWhere('(i.code ILIKE :search OR i.name ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }
    if (filters?.type) {
      qb.andWhere('i.type = :type', { type: filters.type });
    }
    qb.orderBy('i.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findItem(tenantId: string, id: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  async updateItem(tenantId: string, id: string, dto: Partial<Item>): Promise<Item> {
    const item = await this.findItem(tenantId, id);
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  // ─── Stock Balance helper ────────────────────────────────────

  private async getOrCreateBalance(
    tenantId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<StockBalance> {
    let balance = await this.balanceRepo.findOne({
      where: { tenantId, itemId, warehouseId },
    });
    if (!balance) {
      balance = this.balanceRepo.create({
        tenantId,
        itemId,
        warehouseId,
        qtyOnHand: 0,
        qtyReserved: 0,
        totalCost: 0,
        avgCost: 0,
      });
      balance = await this.balanceRepo.save(balance);
    }
    return balance;
  }

  // ─── Stock Operations ────────────────────────────────────────

  private async getItemValuationMethod(tenantId: string, itemId: string): Promise<string> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    return item?.valuationMethod ?? VALUATION_MOVING_AVERAGE;
  }

  async receiveStock(
    tenantId: string,
    itemId: string,
    warehouseId: string,
    qty: number,
    unitCost: number,
    referenceType?: string,
    referenceId?: string,
    date?: string,
    notes?: string,
  ): Promise<StockLedger> {
    const valuationMethod = await this.getItemValuationMethod(tenantId, itemId);
    const txDate = date ?? new Date().toISOString().split('T')[0];
    const balance = await this.getOrCreateBalance(tenantId, itemId, warehouseId);

    let postUnitCost = unitCost;
    let ppv = 0;

    if (valuationMethod === VALUATION_STANDARD) {
      const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
      const stdCost = Number(item?.standardCost ?? unitCost);
      ppv = (unitCost - stdCost) * qty;
      postUnitCost = stdCost;
    }

    const currentQty = Number(balance.qtyOnHand ?? 0);
    const currentUnitCost = Number(balance.unitCost ?? balance.avgCost ?? 0);
    const newTotalCost = balance.totalCost + qty * postUnitCost;
    const newQty = currentQty + qty;

    if (valuationMethod === VALUATION_MOVING_AVERAGE) {
      const newUnitCost = newQty > 0
        ? ((currentQty * currentUnitCost) + (qty * postUnitCost)) / newQty
        : postUnitCost;
      balance.avgCost = newQty > 0 ? newTotalCost / newQty : postUnitCost;
      balance.unitCost = newUnitCost;
    } else {
      // FIFO and STANDARD_COST: balance.avgCost tracks total/qty for reporting
      balance.avgCost = newQty > 0 ? newTotalCost / newQty : postUnitCost;
      balance.unitCost = postUnitCost;
    }

    balance.totalCost = newTotalCost;
    balance.qtyOnHand = newQty;
    balance.totalValue = newQty * (balance.unitCost ?? postUnitCost);
    await this.balanceRepo.save(balance);

    const ledger = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        tenantId,
        itemId,
        warehouseId,
        transactionType: TransactionType.RECEIPT,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        quantity: qty,
        unitCost: postUnitCost,
        totalCost: qty * postUnitCost,
        balanceQty: newQty,
        balanceCost: newTotalCost,
        transactionDate: txDate,
        notes: valuationMethod === VALUATION_STANDARD && ppv !== 0
          ? `${notes ?? ''} | PPV: ${ppv.toFixed(2)} (actual ${unitCost} vs std ${postUnitCost})`.trim()
          : (notes ?? null),
        unitCostMv: unitCost,
        transactionValue: qty * unitCost,
      }),
    );

    if (valuationMethod === VALUATION_FIFO) {
      await this.fifoLayerRepo.save(
        this.fifoLayerRepo.create({
          tenantId,
          itemId,
          warehouseId,
          receiptLedgerId: ledger.id,
          layerDate: txDate,
          qtyOriginal: qty,
          qtyRemaining: qty,
          unitCost: postUnitCost,
        }),
      );
    }

    return ledger;
  }

  async findItemByCode(tenantId: string, code: string): Promise<Item | null> {
    return this.itemRepo.findOne({ where: { tenantId, code } });
  }

  async findBestBalanceForItem(tenantId: string, itemId: string): Promise<StockBalance | null> {
    const balances = await this.balanceRepo.find({ where: { tenantId, itemId }, order: { qtyOnHand: 'DESC' } });
    return balances.find((b) => b.qtyOnHand > 0) ?? null;
  }

  async issueStock(
    tenantId: string,
    itemId: string,
    warehouseId: string,
    qty: number,
    referenceType?: string,
    referenceId?: string,
    date?: string,
    notes?: string,
  ): Promise<StockLedger> {
    const valuationMethod = await this.getItemValuationMethod(tenantId, itemId);
    const txDate = date ?? new Date().toISOString().split('T')[0];
    const balance = await this.getOrCreateBalance(tenantId, itemId, warehouseId);

    if (balance.qtyOnHand < qty) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${balance.qtyOnHand}, Requested: ${qty}`,
      );
    }

    let issueCost: number;

    if (valuationMethod === VALUATION_FIFO) {
      issueCost = await this.consumeFifoLayers(tenantId, itemId, warehouseId, qty);
    } else if (valuationMethod === VALUATION_STANDARD) {
      const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
      issueCost = Number(item?.standardCost ?? balance.avgCost) * qty;
    } else {
      issueCost = balance.avgCost * qty;
    }

    const issueUnitCost = qty > 0 ? issueCost / qty : 0;
    balance.qtyOnHand -= qty;
    balance.totalCost = Math.max(0, balance.totalCost - issueCost);
    balance.avgCost = balance.qtyOnHand > 0 ? balance.totalCost / balance.qtyOnHand : 0;
    await this.balanceRepo.save(balance);

    return this.ledgerRepo.save(
      this.ledgerRepo.create({
        tenantId,
        itemId,
        warehouseId,
        transactionType: TransactionType.ISSUE,
        referenceType: referenceType ?? null,
        referenceId: referenceId ?? null,
        quantity: qty,
        unitCost: issueUnitCost,
        totalCost: issueCost,
        balanceQty: balance.qtyOnHand,
        balanceCost: balance.totalCost,
        transactionDate: txDate,
        notes: notes ?? null,
      }),
    );
  }

  private async consumeFifoLayers(
    tenantId: string,
    itemId: string,
    warehouseId: string,
    qty: number,
  ): Promise<number> {
    const layers = await this.fifoLayerRepo.find({
      where: { tenantId, itemId, warehouseId },
      order: { layerDate: 'ASC', createdAt: 'ASC' },
    });

    let remaining = qty;
    let totalCost = 0;

    for (const layer of layers) {
      if (remaining <= 0) break;
      const consume = Math.min(remaining, Number(layer.qtyRemaining));
      totalCost += consume * Number(layer.unitCost);
      layer.qtyRemaining = Number(layer.qtyRemaining) - consume;
      remaining -= consume;
      await this.fifoLayerRepo.save(layer);
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Insufficient FIFO layers to fulfill issue of ${qty} units`,
      );
    }

    // Clean up fully consumed layers
    await this.fifoLayerRepo.delete({
      tenantId,
      itemId,
      warehouseId,
      qtyRemaining: LessThan(0.0001),
    });

    return totalCost;
  }

  async getFifoLayers(
    tenantId: string,
    itemId: string,
    warehouseId?: string,
  ): Promise<FifoLayer[]> {
    const where: any = { tenantId, itemId };
    if (warehouseId) where.warehouseId = warehouseId;
    return this.fifoLayerRepo.find({
      where,
      order: { layerDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async transferStock(
    tenantId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    itemId: string,
    qty: number,
    date?: string,
  ): Promise<void> {
    const valuationMethod = await this.getItemValuationMethod(tenantId, itemId);
    const fromBalance = await this.getOrCreateBalance(tenantId, itemId, fromWarehouseId);
    if (fromBalance.qtyOnHand < qty) {
      throw new BadRequestException(
        `Insufficient stock in source warehouse. Available: ${fromBalance.qtyOnHand}`,
      );
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];

    let transferCost: number;
    let transferUnitCost: number;

    if (valuationMethod === VALUATION_FIFO) {
      transferCost = await this.consumeFifoLayers(tenantId, itemId, fromWarehouseId, qty);
      transferUnitCost = qty > 0 ? transferCost / qty : 0;
    } else {
      transferUnitCost = fromBalance.avgCost;
      transferCost = transferUnitCost * qty;
    }

    // TRANSFER_OUT
    fromBalance.qtyOnHand -= qty;
    fromBalance.totalCost = Math.max(0, fromBalance.totalCost - transferCost);
    fromBalance.avgCost = fromBalance.qtyOnHand > 0 ? fromBalance.totalCost / fromBalance.qtyOnHand : 0;
    await this.balanceRepo.save(fromBalance);

    await this.ledgerRepo.save(
      this.ledgerRepo.create({
        tenantId,
        itemId,
        warehouseId: fromWarehouseId,
        transactionType: TransactionType.TRANSFER_OUT,
        referenceType: null,
        referenceId: null,
        quantity: qty,
        unitCost: transferUnitCost,
        totalCost: transferCost,
        balanceQty: fromBalance.qtyOnHand,
        balanceCost: fromBalance.totalCost,
        transactionDate: txDate,
        notes: `Transfer to warehouse ${toWarehouseId}`,
      }),
    );

    // TRANSFER_IN
    const toBalance = await this.getOrCreateBalance(tenantId, itemId, toWarehouseId);
    const newTotalCost = toBalance.totalCost + transferCost;
    const newQty = toBalance.qtyOnHand + qty;
    toBalance.avgCost = newQty > 0 ? newTotalCost / newQty : transferUnitCost;
    toBalance.totalCost = newTotalCost;
    toBalance.qtyOnHand = newQty;
    await this.balanceRepo.save(toBalance);

    // For FIFO: move layers from source to destination warehouse
    if (valuationMethod === VALUATION_FIFO) {
      await this.fifoLayerRepo.save(
        this.fifoLayerRepo.create({
          tenantId,
          itemId,
          warehouseId: toWarehouseId,
          receiptLedgerId: null,
          layerDate: txDate,
          qtyOriginal: qty,
          qtyRemaining: qty,
          unitCost: transferUnitCost,
        }),
      );
    }

    await this.ledgerRepo.save(
      this.ledgerRepo.create({
        tenantId,
        itemId,
        warehouseId: toWarehouseId,
        transactionType: TransactionType.TRANSFER_IN,
        referenceType: null,
        referenceId: null,
        quantity: qty,
        unitCost: transferUnitCost,
        totalCost: transferCost,
        balanceQty: newQty,
        balanceCost: newTotalCost,
        transactionDate: txDate,
        notes: `Transfer from warehouse ${fromWarehouseId}`,
      }),
    );
  }

  async getStockBalance(
    tenantId: string,
    itemId?: string,
    warehouseId?: string,
  ): Promise<StockBalance[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    if (warehouseId) where.warehouseId = warehouseId;
    return this.balanceRepo.find({ where });
  }

  async getStockLedger(
    tenantId: string,
    itemId: string,
    warehouseId?: string,
    from?: string,
    to?: string,
    pagination?: PaginationDto,
  ): Promise<PaginatedResponseDto<StockLedger>> {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const qb = this.ledgerRepo
      .createQueryBuilder('l')
      .where('l.tenantId = :tenantId', { tenantId })
      .andWhere('l.itemId = :itemId', { itemId });
    if (warehouseId) qb.andWhere('l.warehouseId = :warehouseId', { warehouseId });
    if (from) qb.andWhere('l.transactionDate >= :from', { from });
    if (to) qb.andWhere('l.transactionDate <= :to', { to });
    qb.orderBy('l.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // ─── Stock Adjustments ───────────────────────────────────────

  private async nextAdjNumber(tenantId: string): Promise<string> {
    const row = await this.adjustmentRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.adj_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `ADJ-${String(next).padStart(6, '0')}`;
  }

  async createAdjustment(tenantId: string, dto: Partial<StockAdjustment>): Promise<StockAdjustment> {
    const adjNumber = await this.nextAdjNumber(tenantId);
    const entity = this.adjustmentRepo.create({
      ...dto,
      tenantId,
      adjNumber,
      status: AdjustmentStatus.DRAFT,
    });
    return this.adjustmentRepo.save(entity);
  }

  async findAdjustments(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<StockAdjustment>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.adjustmentRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findAdjustment(tenantId: string, id: string): Promise<StockAdjustment> {
    const adj = await this.adjustmentRepo.findOne({ where: { id, tenantId } });
    if (!adj) throw new NotFoundException(`Adjustment ${id} not found`);
    return adj;
  }

  async postAdjustment(tenantId: string, id: string): Promise<StockAdjustment> {
    const adj = await this.findAdjustment(tenantId, id);
    if (adj.status !== AdjustmentStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT adjustments can be posted');
    }
    const txDate = adj.adjDate;
    for (const line of adj.lines ?? []) {
      const { itemId, qty, unitCost } = line;
      if (!itemId) continue;
      const balance = await this.getOrCreateBalance(tenantId, itemId, adj.warehouseId);
      const qtyDiff = Number(qty);
      const cost = Number(unitCost ?? balance.avgCost ?? 0);
      const newQty = balance.qtyOnHand + qtyDiff;
      const newTotalCost = balance.totalCost + qtyDiff * cost;
      balance.qtyOnHand = newQty;
      balance.totalCost = newTotalCost > 0 ? newTotalCost : 0;
      balance.avgCost = newQty > 0 ? balance.totalCost / newQty : 0;
      await this.balanceRepo.save(balance);

      await this.ledgerRepo.save(
        this.ledgerRepo.create({
          tenantId,
          itemId,
          warehouseId: adj.warehouseId,
          transactionType: TransactionType.ADJUSTMENT,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceId: adj.id,
          quantity: qtyDiff,
          unitCost: cost,
          totalCost: qtyDiff * cost,
          balanceQty: balance.qtyOnHand,
          balanceCost: balance.totalCost,
          transactionDate: txDate,
          notes: adj.reason,
        }),
      );
    }
    adj.status = AdjustmentStatus.POSTED;
    return this.adjustmentRepo.save(adj);
  }
}
