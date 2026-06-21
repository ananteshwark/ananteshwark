import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bom, BomLine, BomStatus } from './entities/bom.entity';
import { WorkCenter } from './entities/work-center.entity';
import { ProductionOrder, ProductionOrderStatus, MaterialIssuance } from './entities/production-order.entity';
import {
  CreateBomDto, CreateWorkCenterDto, CreateProductionOrderDto,
  CompleteProductionOrderDto, IssueMaterialDto,
} from './dto/manufacturing.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { GlService } from '../finance/gl/gl.service';
import { JournalSource } from '../finance/gl/entities/journal-entry.entity';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ManufacturingService {
  constructor(
    @InjectRepository(Bom) private readonly bomRepo: Repository<Bom>,
    @InjectRepository(BomLine) private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(WorkCenter) private readonly wcRepo: Repository<WorkCenter>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(MaterialIssuance) private readonly issuanceRepo: Repository<MaterialIssuance>,
    private readonly glService: GlService,
    private readonly inventoryService: InventoryService,
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

    // Best-effort: deduct stock from inventory when the item exists there
    try {
      const item = await this.inventoryService.findItemByCode(tenantId, dto.componentCode);
      if (item) {
        const balance = await this.inventoryService.findBestBalanceForItem(tenantId, item.id);
        if (balance && balance.qtyOnHand >= dto.issuedQuantity) {
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
    } catch (_) {
      // Non-blocking: issuance is recorded even if inventory deduction fails
    }

    return saved;
  }

  async getIssuances(tenantId: string, orderId: string): Promise<MaterialIssuance[]> {
    return this.issuanceRepo.find({ where: { tenantId, productionOrderId: orderId } });
  }
}
