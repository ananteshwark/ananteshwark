import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderStatus, FulfilmentStatus } from './entities/sales-order.entity';
import { SalesOrderLine, LineStatus } from './entities/sales-order-line.entity';
import { PriceList, PriceListItem } from './entities/price-list.entity';
import {
  CreateSalesOrderDto, UpdateSalesOrderDto, ShipOrderDto,
  CreatePriceListDto, PriceListItemDto,
} from './dto/sales.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { ArService } from '../finance/ar/ar.service';
import { GlService } from '../finance/gl/gl.service';
import { IcBillingService } from '../finance/intercompany/ic-billing.service';
import { CreditService } from './credit.service';
import { AtpService } from './atp.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine)
    private readonly lineRepo: Repository<SalesOrderLine>,
    @InjectRepository(PriceList)
    private readonly priceListRepo: Repository<PriceList>,
    @InjectRepository(PriceListItem)
    private readonly priceListItemRepo: Repository<PriceListItem>,
    private readonly arService: ArService,
    private readonly glService: GlService,
    private readonly icBillingService: IcBillingService,
    private readonly creditService: CreditService,
    private readonly atpService: AtpService,
  ) {}

  // ---- Order number sequence ----
  private async nextOrderNumber(tenantId: string): Promise<string> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .select(`MAX(CAST(NULLIF(regexp_replace(o.order_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('o.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `SO-${String(next).padStart(6, '0')}`;
  }

  // ---- Compute line totals ----
  private computeLines(lines: CreateSalesOrderDto['lines']) {
    let subtotal = 0;
    let taxAmount = 0;
    const computed = lines.map((l, idx) => {
      const disc = l.discountPct ?? 0;
      const tax = l.taxPct ?? 0;
      const base = round2(l.quantity * l.unitPrice * (1 - disc / 100));
      const lineTax = round2(base * tax / 100);
      const lineTotal = round2(base + lineTax);
      subtotal += base;
      taxAmount += lineTax;
      return { ...l, lineNumber: idx + 1, discountPct: disc, taxPct: tax, lineTotal };
    });
    return { computed, subtotal: round2(subtotal), taxAmount: round2(taxAmount), total: round2(subtotal + taxAmount) };
  }

  // ---- Sales Orders ----
  async createOrder(tenantId: string, dto: CreateSalesOrderDto): Promise<SalesOrder> {
    const orderNumber = await this.nextOrderNumber(tenantId);
    const { computed, subtotal, taxAmount, total } = this.computeLines(dto.lines);

    // ---- Credit check (additive) ----
    let creditWarning: string | undefined;
    if (dto.customerId) {
      try {
        const credit = await this.creditService.checkCredit(tenantId, dto.customerId, total);
        if (credit.status === 'BLOCKED') {
          throw new BadRequestException(credit.message || 'Order blocked: customer credit limit exceeded');
        }
        if (credit.status === 'WARNING') {
          creditWarning = credit.message;
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Missing customer / lookup issues should not block order creation.
      }
    }

    const order = await this.orderRepo.save(
      this.orderRepo.create({
        ...dto,
        tenantId,
        orderNumber,
        status: SalesOrderStatus.DRAFT,
        fulfilmentStatus: FulfilmentStatus.PENDING,
        subtotal,
        taxAmount,
        total,
        currency: dto.currency || 'INR',
      }),
    );
    const lineEntities = computed.map(l =>
      this.lineRepo.create({ ...l, tenantId, orderId: order.id }),
    );
    await this.lineRepo.save(lineEntities);
    if (creditWarning) (order as any).creditWarning = creditWarning;
    return order;
  }

  async listOrders(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { status?: string; customerId?: string; search?: string },
  ): Promise<PaginatedResponseDto<SalesOrder>> {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'DESC' } = pagination;
    const qb = this.orderRepo.createQueryBuilder('o').where('o.tenantId = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('o.status = :status', { status: filters.status });
    if (filters?.customerId) qb.andWhere('o.customerId = :cid', { cid: filters.customerId });
    if (filters?.search) {
      qb.andWhere('(o.orderNumber ILIKE :s OR o.contactName ILIKE :s)', { s: `%${filters.search}%` });
    }
    qb.orderBy(`o.${sortBy}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOrder(tenantId: string, id: string): Promise<SalesOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id } });
    if (!order) throw new NotFoundException(`Sales order ${id} not found`);
    return order;
  }

  async getOrderLines(tenantId: string, orderId: string): Promise<SalesOrderLine[]> {
    await this.findOrder(tenantId, orderId);
    return this.lineRepo.find({ where: { tenantId, orderId }, order: { lineNumber: 'ASC' } });
  }

  async updateOrder(tenantId: string, id: string, dto: UpdateSalesOrderDto): Promise<SalesOrder> {
    const order = await this.findOrder(tenantId, id);
    if (order.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be updated');
    }
    if (dto.lines) {
      const { computed, subtotal, taxAmount, total } = this.computeLines(dto.lines);
      await this.lineRepo.delete({ orderId: id, tenantId });
      const lineEntities = computed.map(l =>
        this.lineRepo.create({ ...l, tenantId, orderId: id }),
      );
      await this.lineRepo.save(lineEntities);
      Object.assign(order, { ...dto, subtotal, taxAmount, total, lines: undefined });
    } else {
      Object.assign(order, dto);
    }
    return this.orderRepo.save(order);
  }

  async confirmOrder(tenantId: string, id: string): Promise<SalesOrder> {
    const order = await this.findOrder(tenantId, id);
    if (order.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT orders can be confirmed');
    }

    // ---- ATP check + stock commitment (additive, non-blocking) ----
    const atpWarnings: string[] = [];
    try {
      const lines = await this.getOrderLines(tenantId, id);
      for (const line of lines) {
        if (!line.inventoryItemId || line.quantity <= 0) continue;
        const atp = await this.atpService.checkATP(tenantId, line.inventoryItemId, null, line.quantity);
        if (atp.status === 'INSUFFICIENT') {
          atpWarnings.push(
            `${line.itemName}: requested ${line.quantity}, available ${atp.availableQty}, shortfall ${atp.shortfall ?? 0}`,
          );
        }
        await this.atpService.commitForItem(tenantId, line.inventoryItemId, line.quantity);
      }
    } catch (_) {
      // ATP is advisory; never block confirmation on it.
    }

    order.status = SalesOrderStatus.CONFIRMED;
    const saved = await this.orderRepo.save(order);
    if (atpWarnings.length) (saved as any).atpWarnings = atpWarnings;
    return saved;
  }

  async shipOrder(tenantId: string, id: string, dto: ShipOrderDto): Promise<SalesOrder> {
    const order = await this.findOrder(tenantId, id);
    if (![SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS].includes(order.status)) {
      throw new BadRequestException('Order must be CONFIRMED or IN_PROGRESS to ship');
    }

    const lines = await this.getOrderLines(tenantId, id);
    let allShipped = true;
    let anyShipped = false;

    for (const line of lines) {
      const qtyToShip = dto.lineQties?.[line.id] ?? (line.quantity - line.qtyShipped);
      if (qtyToShip <= 0) continue;
      const newQtyShipped = Math.min(line.qtyShipped + qtyToShip, line.quantity);
      line.qtyShipped = round2(newQtyShipped);
      line.status = newQtyShipped >= line.quantity ? LineStatus.FULFILLED : LineStatus.PARTIAL;
      anyShipped = true;
      if (line.status !== LineStatus.FULFILLED) allShipped = false;
    }
    await this.lineRepo.save(lines);

    order.shippedDate = dto.shippedDate;
    order.status = SalesOrderStatus.SHIPPED;
    order.fulfilmentStatus = allShipped
      ? FulfilmentStatus.FULFILLED
      : anyShipped
      ? FulfilmentStatus.PARTIAL
      : FulfilmentStatus.PENDING;

    return this.orderRepo.save(order);
  }

  async completeOrder(tenantId: string, id: string, userId: string): Promise<SalesOrder> {
    const order = await this.findOrder(tenantId, id);
    if (order.status !== SalesOrderStatus.SHIPPED) {
      throw new BadRequestException('Order must be SHIPPED to complete');
    }

    // Auto-create AR invoice if customerId is set and no invoice exists yet
    if (order.customerId && !order.arInvoiceId) {
      try {
        const lines = await this.getOrderLines(tenantId, id);
        // Find AR revenue account (best-effort)
        const revenueAccounts = await this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: 'revenue' });
        if (revenueAccounts.items.length > 0) {
          const accountId = revenueAccounts.items[0].id;
          const today = new Date().toISOString().slice(0, 10);
          const invNumber = `INV-SO-${order.orderNumber}`;
          const invoice = await this.arService.createInvoice(tenantId, {
            invoiceNumber: invNumber,
            customerId: order.customerId,
            invoiceDate: today,
            currency: order.currency,
            reference: order.orderNumber,
            notes: `Auto-generated from Sales Order ${order.orderNumber}`,
            lines: lines.map(l => ({
              accountId,
              description: l.itemName,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxPct,
            })),
          } as any);
          order.arInvoiceId = invoice.id;
        }
      } catch (_) {
        // AR invoice creation is best-effort
      }
    }

    // Intercompany: generate the mirror AP bill in the buying entity.
    if (order.isIntercompany && order.icRelationshipId && order.arInvoiceId && !order.icBillId) {
      try {
        const result = await this.icBillingService.generateMirrorBill(
          tenantId,
          order.arInvoiceId,
          order.icRelationshipId,
          userId,
        );
        order.icBillId = result.billId;
      } catch (_) {
        // Mirror bill generation is best-effort; relationship may be misconfigured.
      }
    }

    order.status = SalesOrderStatus.COMPLETED;
    order.fulfilmentStatus = FulfilmentStatus.FULFILLED;
    return this.orderRepo.save(order);
  }

  async cancelOrder(tenantId: string, id: string): Promise<SalesOrder> {
    const order = await this.findOrder(tenantId, id);
    if ([SalesOrderStatus.COMPLETED, SalesOrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('Cannot cancel a completed or already cancelled order');
    }

    // ---- Release committed stock for previously confirmed orders (additive) ----
    if ([SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS].includes(order.status)) {
      try {
        const lines = await this.getOrderLines(tenantId, id);
        for (const line of lines) {
          if (!line.inventoryItemId || line.quantity <= 0) continue;
          await this.atpService.releaseForItem(tenantId, line.inventoryItemId, line.quantity);
        }
      } catch (_) {
        // Best-effort release.
      }
    }

    order.status = SalesOrderStatus.CANCELLED;
    return this.orderRepo.save(order);
  }

  async convertFromQuote(tenantId: string, quoteId: string, dto: Partial<CreateSalesOrderDto>): Promise<SalesOrder> {
    // CRM quotes store lines in JSONB
    const quoteRepo = this.orderRepo.manager.getRepository('crm_quotes');
    const quote: any = await quoteRepo.findOne({ where: { id: quoteId, tenantId } });
    if (!quote) throw new NotFoundException(`Quote ${quoteId} not found`);

    const lines: CreateSalesOrderDto['lines'] = (quote.lines || []).map((l: any) => ({
      itemName: l.itemName || l.description || 'Item',
      itemCode: l.itemCode,
      description: l.description,
      quantity: l.quantity ?? 1,
      unitPrice: l.unitPrice ?? 0,
      discountPct: l.discountPct ?? 0,
      taxPct: l.taxPct ?? 0,
    }));

    return this.createOrder(tenantId, {
      quoteId,
      customerId: dto.customerId ?? quote.contactId,
      contactName: dto.contactName ?? quote.title,
      orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
      currency: dto.currency ?? quote.currency,
      lines,
    });
  }

  // ---- Price Lists ----
  async createPriceList(tenantId: string, dto: CreatePriceListDto): Promise<PriceList> {
    const existing = await this.priceListRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Price list code ${dto.code} already exists`);
    return this.priceListRepo.save(this.priceListRepo.create({ ...dto, tenantId }));
  }

  async listPriceLists(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<PriceList>> {
    const { page = 1, limit = 50 } = pagination;
    const [items, total] = await this.priceListRepo.findAndCount({
      where: { tenantId }, skip: (page - 1) * limit, take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async addPriceListItem(tenantId: string, priceListId: string, dto: PriceListItemDto): Promise<PriceListItem> {
    const pl = await this.priceListRepo.findOne({ where: { tenantId, id: priceListId } });
    if (!pl) throw new NotFoundException(`Price list ${priceListId} not found`);
    return this.priceListItemRepo.save(
      this.priceListItemRepo.create({ ...dto, tenantId, priceListId }),
    );
  }

  async getPriceListItems(tenantId: string, priceListId: string): Promise<PriceListItem[]> {
    return this.priceListItemRepo.find({ where: { tenantId, priceListId } });
  }
}
