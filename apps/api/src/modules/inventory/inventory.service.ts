import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Item } from './entities/item.entity';
import { StockLedger, TransactionType } from './entities/stock-ledger.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { StockAdjustment, AdjustmentStatus } from './entities/stock-adjustment.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

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
    const balance = await this.getOrCreateBalance(tenantId, itemId, warehouseId);
    const currentQty = Number(balance.qtyOnHand ?? 0);
    const currentUnitCost = Number(balance.unitCost ?? balance.avgCost ?? 0);
    const newTotalCost = balance.totalCost + qty * unitCost;
    const newQty = currentQty + qty;

    // Moving average unit cost
    const newUnitCost = newQty > 0
      ? ((currentQty * currentUnitCost) + (qty * unitCost)) / newQty
      : unitCost;

    balance.avgCost = newQty > 0 ? newTotalCost / newQty : unitCost;
    balance.totalCost = newTotalCost;
    balance.qtyOnHand = newQty;
    balance.unitCost = newUnitCost;
    balance.totalValue = newQty * newUnitCost;
    await this.balanceRepo.save(balance);

    const ledger = this.ledgerRepo.create({
      tenantId,
      itemId,
      warehouseId,
      transactionType: TransactionType.RECEIPT,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      quantity: qty,
      unitCost,
      totalCost: qty * unitCost,
      balanceQty: newQty,
      balanceCost: newTotalCost,
      transactionDate: date ?? new Date().toISOString().split('T')[0],
      notes: notes ?? null,
      unitCostMv: unitCost,
      transactionValue: qty * unitCost,
    });
    return this.ledgerRepo.save(ledger);
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
    const balance = await this.getOrCreateBalance(tenantId, itemId, warehouseId);
    if (balance.qtyOnHand < qty) {
      throw new BadRequestException(
        `Insufficient stock. Available: ${balance.qtyOnHand}, Requested: ${qty}`,
      );
    }
    const costDeducted = balance.avgCost * qty;
    balance.qtyOnHand -= qty;
    balance.totalCost -= costDeducted;
    await this.balanceRepo.save(balance);

    const ledger = this.ledgerRepo.create({
      tenantId,
      itemId,
      warehouseId,
      transactionType: TransactionType.ISSUE,
      referenceType: referenceType ?? null,
      referenceId: referenceId ?? null,
      quantity: qty,
      unitCost: balance.avgCost,
      totalCost: costDeducted,
      balanceQty: balance.qtyOnHand,
      balanceCost: balance.totalCost,
      transactionDate: date ?? new Date().toISOString().split('T')[0],
      notes: notes ?? null,
    });
    return this.ledgerRepo.save(ledger);
  }

  async transferStock(
    tenantId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    itemId: string,
    qty: number,
    date?: string,
  ): Promise<void> {
    const fromBalance = await this.getOrCreateBalance(tenantId, itemId, fromWarehouseId);
    if (fromBalance.qtyOnHand < qty) {
      throw new BadRequestException(
        `Insufficient stock in source warehouse. Available: ${fromBalance.qtyOnHand}`,
      );
    }
    const avgCost = fromBalance.avgCost;
    const txDate = date ?? new Date().toISOString().split('T')[0];

    // TRANSFER_OUT
    fromBalance.qtyOnHand -= qty;
    fromBalance.totalCost -= avgCost * qty;
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
        unitCost: avgCost,
        totalCost: avgCost * qty,
        balanceQty: fromBalance.qtyOnHand,
        balanceCost: fromBalance.totalCost,
        transactionDate: txDate,
        notes: `Transfer to warehouse ${toWarehouseId}`,
      }),
    );

    // TRANSFER_IN
    const toBalance = await this.getOrCreateBalance(tenantId, itemId, toWarehouseId);
    const newTotalCost = toBalance.totalCost + avgCost * qty;
    const newQty = toBalance.qtyOnHand + qty;
    toBalance.avgCost = newQty > 0 ? newTotalCost / newQty : avgCost;
    toBalance.totalCost = newTotalCost;
    toBalance.qtyOnHand = newQty;
    await this.balanceRepo.save(toBalance);

    await this.ledgerRepo.save(
      this.ledgerRepo.create({
        tenantId,
        itemId,
        warehouseId: toWarehouseId,
        transactionType: TransactionType.TRANSFER_IN,
        referenceType: null,
        referenceId: null,
        quantity: qty,
        unitCost: avgCost,
        totalCost: avgCost * qty,
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
