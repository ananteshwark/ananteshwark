import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubcontractOrder, SubcontractStatus } from './entities/subcontract-order.entity';
import { ConsignmentStock, ConsignmentStatus } from './entities/consignment-stock.entity';
import { StockTransferOrder, StoStatus } from './entities/stock-transfer-order.entity';
import { InventoryService } from './inventory.service';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class SpecialProcurementService {
  constructor(
    @InjectRepository(SubcontractOrder)
    private readonly scRepo: Repository<SubcontractOrder>,
    @InjectRepository(ConsignmentStock)
    private readonly consignmentRepo: Repository<ConsignmentStock>,
    @InjectRepository(StockTransferOrder)
    private readonly stoRepo: Repository<StockTransferOrder>,
    private readonly inventoryService: InventoryService,
  ) {}

  // ─── Subcontracting ──────────────────────────────────────────────────────────

  private async nextScNumber(tenantId: string): Promise<string> {
    const count = await this.scRepo.count({ where: { tenantId } });
    return `SC-${String(count + 1).padStart(5, '0')}`;
  }

  async createSubcontractOrder(tenantId: string, dto: any): Promise<SubcontractOrder> {
    const scNumber = await this.nextScNumber(tenantId);
    const sc = this.scRepo.create({
      tenantId,
      scNumber,
      vendorId: dto.vendorId ?? null,
      vendorName: dto.vendorName ?? null,
      poId: dto.poId ?? null,
      itemId: dto.itemId,
      itemCode: dto.itemCode,
      finishedQty: dto.finishedQty,
      unitConversionCost: dto.unitConversionCost ?? 0,
      receivingWarehouseId: dto.receivingWarehouseId ?? null,
      sendingWarehouseId: dto.sendingWarehouseId ?? null,
      components: dto.components ?? [],
      plannedDate: dto.plannedDate ?? null,
      notes: dto.notes ?? null,
    });
    return this.scRepo.save(sc);
  }

  async listSubcontractOrders(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<SubcontractOrder>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.scRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getSubcontractOrder(tenantId: string, id: string): Promise<SubcontractOrder> {
    const sc = await this.scRepo.findOne({ where: { id, tenantId } });
    if (!sc) throw new NotFoundException(`Subcontract order ${id} not found`);
    return sc;
  }

  async sendComponents(tenantId: string, id: string, date?: string): Promise<SubcontractOrder> {
    const sc = await this.getSubcontractOrder(tenantId, id);
    if (sc.status !== SubcontractStatus.DRAFT) {
      throw new BadRequestException('Can only send components for DRAFT subcontract orders');
    }
    if (!sc.sendingWarehouseId) {
      throw new BadRequestException('sendingWarehouseId is required to send components');
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    for (const comp of sc.components) {
      await this.inventoryService.issueStock(
        tenantId,
        comp.itemId,
        sc.sendingWarehouseId,
        comp.qty,
        'SUBCONTRACT',
        id,
        txDate,
        `Subcontract ${sc.scNumber} — components sent`,
      );
    }
    sc.status = SubcontractStatus.COMPONENTS_SENT;
    sc.actualSendDate = txDate;
    return this.scRepo.save(sc);
  }

  async receiveFinishedGoods(tenantId: string, id: string, date?: string): Promise<SubcontractOrder> {
    const sc = await this.getSubcontractOrder(tenantId, id);
    if (sc.status !== SubcontractStatus.COMPONENTS_SENT) {
      throw new BadRequestException('Components must be sent before receiving finished goods');
    }
    if (!sc.receivingWarehouseId) {
      throw new BadRequestException('receivingWarehouseId is required to receive finished goods');
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    const materialCost = sc.components.reduce((sum, c) => sum + c.qty * c.unitCost, 0);
    const totalUnitCost = materialCost / sc.finishedQty + sc.unitConversionCost;

    await this.inventoryService.receiveStock(
      tenantId,
      sc.itemId,
      sc.receivingWarehouseId,
      sc.finishedQty,
      totalUnitCost,
      'SUBCONTRACT',
      id,
      txDate,
      `Subcontract ${sc.scNumber} — finished goods received`,
    );
    sc.status = SubcontractStatus.FINISHED_RECEIVED;
    sc.actualReceiveDate = txDate;
    return this.scRepo.save(sc);
  }

  async completeSubcontractOrder(tenantId: string, id: string): Promise<SubcontractOrder> {
    const sc = await this.getSubcontractOrder(tenantId, id);
    if (sc.status !== SubcontractStatus.FINISHED_RECEIVED) {
      throw new BadRequestException('Finished goods must be received before completing');
    }
    sc.status = SubcontractStatus.COMPLETED;
    return this.scRepo.save(sc);
  }

  // ─── Consignment Stock ───────────────────────────────────────────────────────

  async receiveConsignment(tenantId: string, dto: any): Promise<ConsignmentStock> {
    const cs = this.consignmentRepo.create({
      tenantId,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName ?? null,
      itemId: dto.itemId,
      warehouseId: dto.warehouseId,
      qtyReceived: dto.qty,
      qtyConsumed: 0,
      qtyReturned: 0,
      unitCost: dto.unitCost,
      receiptDate: dto.receiptDate ?? new Date().toISOString().split('T')[0],
      notes: dto.notes ?? null,
      status: ConsignmentStatus.ACTIVE,
    });
    return this.consignmentRepo.save(cs);
  }

  async listConsignmentStock(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { vendorId?: string; itemId?: string },
  ): Promise<PaginatedResponseDto<ConsignmentStock>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.consignmentRepo
      .createQueryBuilder('cs')
      .where('cs.tenantId = :tenantId', { tenantId });
    if (filters?.vendorId) qb.andWhere('cs.vendorId = :vendorId', { vendorId: filters.vendorId });
    if (filters?.itemId) qb.andWhere('cs.itemId = :itemId', { itemId: filters.itemId });
    qb.orderBy('cs.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async consumeConsignment(tenantId: string, id: string, qty: number, date?: string): Promise<ConsignmentStock> {
    const cs = await this.consignmentRepo.findOne({ where: { id, tenantId } });
    if (!cs) throw new NotFoundException(`Consignment stock ${id} not found`);
    if (cs.status !== ConsignmentStatus.ACTIVE && cs.status !== ConsignmentStatus.PARTIALLY_RETURNED) {
      throw new BadRequestException('Consignment stock is not available for consumption');
    }
    const available = cs.qtyReceived - cs.qtyConsumed - cs.qtyReturned;
    if (qty > available) {
      throw new BadRequestException(`Only ${available} units available in consignment`);
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    await this.inventoryService.receiveStock(
      tenantId,
      cs.itemId,
      cs.warehouseId,
      qty,
      cs.unitCost,
      'CONSIGNMENT',
      id,
      txDate,
      `Consignment consumed — vendor ${cs.vendorName ?? cs.vendorId}`,
    );
    cs.qtyConsumed += qty;
    const remainingAvailable = cs.qtyReceived - cs.qtyConsumed - cs.qtyReturned;
    if (remainingAvailable <= 0) cs.status = ConsignmentStatus.FULLY_CONSUMED;
    return this.consignmentRepo.save(cs);
  }

  async returnConsignment(tenantId: string, id: string, qty: number, date?: string): Promise<ConsignmentStock> {
    const cs = await this.consignmentRepo.findOne({ where: { id, tenantId } });
    if (!cs) throw new NotFoundException(`Consignment stock ${id} not found`);
    const available = cs.qtyReceived - cs.qtyConsumed - cs.qtyReturned;
    if (qty > available) {
      throw new BadRequestException(`Only ${available} units available to return`);
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    cs.qtyReturned += qty;
    const remainingAvailable = cs.qtyReceived - cs.qtyConsumed - cs.qtyReturned;
    if (remainingAvailable <= 0) {
      cs.status = ConsignmentStatus.RETURNED;
    } else {
      cs.status = ConsignmentStatus.PARTIALLY_RETURNED;
    }
    return this.consignmentRepo.save(cs);
  }

  // ─── Stock Transfer Orders ───────────────────────────────────────────────────

  private async nextStoNumber(tenantId: string): Promise<string> {
    const count = await this.stoRepo.count({ where: { tenantId } });
    return `STO-${String(count + 1).padStart(5, '0')}`;
  }

  async createSto(tenantId: string, dto: any, userId?: string): Promise<StockTransferOrder> {
    const stoNumber = await this.nextStoNumber(tenantId);
    const sto = this.stoRepo.create({
      tenantId,
      stoNumber,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      lines: dto.lines ?? [],
      plannedDate: dto.plannedDate ?? null,
      requestedById: userId ?? null,
      notes: dto.notes ?? null,
    });
    return this.stoRepo.save(sto);
  }

  async listStos(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<StockTransferOrder>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.stoRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getSto(tenantId: string, id: string): Promise<StockTransferOrder> {
    const sto = await this.stoRepo.findOne({ where: { id, tenantId } });
    if (!sto) throw new NotFoundException(`Stock transfer order ${id} not found`);
    return sto;
  }

  async approveSto(tenantId: string, id: string, userId?: string): Promise<StockTransferOrder> {
    const sto = await this.getSto(tenantId, id);
    if (sto.status !== StoStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT STOs can be approved');
    }
    sto.status = StoStatus.APPROVED;
    sto.approvedById = userId ?? null;
    return this.stoRepo.save(sto);
  }

  async issueGoodsSto(tenantId: string, id: string, date?: string): Promise<StockTransferOrder> {
    const sto = await this.getSto(tenantId, id);
    if (sto.status !== StoStatus.APPROVED) {
      throw new BadRequestException('STO must be APPROVED before issuing goods');
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    for (const line of sto.lines) {
      await this.inventoryService.issueStock(
        tenantId,
        line.itemId,
        sto.fromWarehouseId,
        line.qty,
        'STO',
        id,
        txDate,
        `STO ${sto.stoNumber} — goods issued`,
      );
    }
    sto.status = StoStatus.GOODS_ISSUED;
    sto.actualIssueDate = txDate;
    return this.stoRepo.save(sto);
  }

  async receiveGoodsSto(tenantId: string, id: string, date?: string): Promise<StockTransferOrder> {
    const sto = await this.getSto(tenantId, id);
    if (sto.status !== StoStatus.GOODS_ISSUED) {
      throw new BadRequestException('Goods must be issued before receiving');
    }
    const txDate = date ?? new Date().toISOString().split('T')[0];
    for (const line of sto.lines) {
      const balances = await this.inventoryService.getStockBalance(tenantId, line.itemId, sto.fromWarehouseId);
      const unitCost = balances[0]?.avgCost ?? 0;
      await this.inventoryService.receiveStock(
        tenantId,
        line.itemId,
        sto.toWarehouseId,
        line.qty,
        unitCost,
        'STO',
        id,
        txDate,
        `STO ${sto.stoNumber} — goods received`,
      );
    }
    sto.status = StoStatus.GOODS_RECEIVED;
    sto.actualReceiptDate = txDate;
    return this.stoRepo.save(sto);
  }

  async completeSto(tenantId: string, id: string): Promise<StockTransferOrder> {
    const sto = await this.getSto(tenantId, id);
    if (sto.status !== StoStatus.GOODS_RECEIVED) {
      throw new BadRequestException('Goods must be received before completing STO');
    }
    sto.status = StoStatus.COMPLETED;
    return this.stoRepo.save(sto);
  }
}
