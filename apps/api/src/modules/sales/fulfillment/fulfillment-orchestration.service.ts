import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupplyLink, SupplyType, SupplyDocType, SupplyLinkStatus } from './entities/supply-link.entity';
import { SalesOrder } from '../entities/sales-order.entity';
import { SalesOrderLine, LineStatus } from '../entities/sales-order-line.entity';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

@Injectable()
export class FulfillmentOrchestrationService {
  constructor(
    @InjectRepository(SupplyLink) private readonly linkRepo: Repository<SupplyLink>,
    @InjectRepository(SalesOrder) private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine) private readonly lineRepo: Repository<SalesOrderLine>,
  ) {}

  async list(tenantId: string, params: { salesOrderId?: string; status?: SupplyLinkStatus; supplyType?: SupplyType } = {}): Promise<SupplyLink[]> {
    const where: any = { tenantId };
    if (params.salesOrderId) where.salesOrderId = params.salesOrderId;
    if (params.status) where.status = params.status;
    if (params.supplyType) where.supplyType = params.supplyType;
    return this.linkRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  private async getLineOrThrow(tenantId: string, salesOrderLineId: string): Promise<SalesOrderLine> {
    const line = await this.lineRepo.findOne({ where: { id: salesOrderLineId, tenantId } });
    if (!line) throw new NotFoundException(`Sales order line ${salesOrderLineId} not found`);
    return line;
  }

  // ─── Ph-145/146: create supply requirement ────────────────────────

  /** Create a drop-ship or back-to-back supply link for a sales-order line. */
  async createSupplyLink(tenantId: string, data: {
    salesOrderLineId: string; supplyType: SupplyType; vendorId?: string; quantity?: number; expectedDate?: string; notes?: string;
  }): Promise<SupplyLink> {
    const line = await this.getLineOrThrow(tenantId, data.salesOrderLineId);
    const existing = await this.linkRepo.findOne({
      where: { tenantId, salesOrderLineId: data.salesOrderLineId, status: SupplyLinkStatus.REQUESTED },
    });
    if (existing) throw new BadRequestException('An open supply link already exists for this line');

    const qty = data.quantity != null ? round4(data.quantity) : round4(Number(line.quantity) - Number(line.qtyShipped));
    if (qty <= 0) throw new BadRequestException('Nothing left to supply on this line');

    const link = this.linkRepo.create({
      tenantId,
      salesOrderId: line.orderId,
      salesOrderLineId: data.salesOrderLineId,
      supplyType: data.supplyType,
      itemId: line.inventoryItemId ?? null,
      quantity: qty,
      fulfilledQty: 0,
      vendorId: data.vendorId ?? null,
      status: SupplyLinkStatus.REQUESTED,
      expectedDate: data.expectedDate ?? null,
      notes: data.notes ?? null,
    } as any) as unknown as SupplyLink;
    const saved = (await this.linkRepo.save(link)) as unknown as SupplyLink;

    // tag the SO line with its fulfillment source
    line.fulfillmentType = data.supplyType;
    await this.lineRepo.save(line);
    return saved;
  }

  /** Attach the created supply document (PO / production order) to the link. */
  async markOrdered(tenantId: string, id: string, data: {
    supplyDocType: SupplyDocType; supplyDocId: string; supplyDocNumber?: string; expectedDate?: string;
  }): Promise<SupplyLink> {
    const link = await this.getLink(tenantId, id);
    if (link.status !== SupplyLinkStatus.REQUESTED) throw new BadRequestException(`Cannot order a ${link.status} link`);
    link.supplyDocType = data.supplyDocType;
    link.supplyDocId = data.supplyDocId;
    link.supplyDocNumber = data.supplyDocNumber ?? null;
    if (data.expectedDate) link.expectedDate = data.expectedDate;
    link.status = SupplyLinkStatus.ORDERED;
    return (this.linkRepo.save(link) as unknown) as Promise<SupplyLink>;
  }

  // ─── Ph-147 hook: receive supply ──────────────────────────────────

  /**
   * Record receipt of supply (full or partial). For DROP_SHIP this directly
   * advances the SO line's shipped qty (supplier delivered to customer); for
   * BACK_TO_BACK the goods land in stock and ship through the normal delivery
   * flow, so the SO line is not auto-shipped here.
   */
  async receiveSupply(tenantId: string, id: string, receiptQty: number): Promise<{ link: SupplyLink; line: SalesOrderLine }> {
    const link = await this.getLink(tenantId, id);
    if (link.status !== SupplyLinkStatus.ORDERED && link.status !== SupplyLinkStatus.RECEIVED) {
      throw new BadRequestException(`Cannot receive against a ${link.status} link`);
    }
    const qty = round4(receiptQty);
    if (qty <= 0) throw new BadRequestException('receiptQty must be > 0');
    const remaining = round4(Number(link.quantity) - Number(link.fulfilledQty));
    if (qty > remaining) throw new BadRequestException(`Receipt ${qty} exceeds outstanding supply ${remaining}`);

    link.fulfilledQty = round4(Number(link.fulfilledQty) + qty);
    const fullyReceived = round4(Number(link.quantity) - Number(link.fulfilledQty)) <= 0;

    const line = await this.getLineOrThrow(tenantId, link.salesOrderLineId);
    if (link.supplyType === SupplyType.DROP_SHIP) {
      // supplier shipped straight to the customer → relieve the SO line
      line.qtyShipped = round4(Number(line.qtyShipped) + qty);
      line.status = round4(Number(line.quantity) - Number(line.qtyShipped)) <= 0 ? LineStatus.FULFILLED : LineStatus.PARTIAL;
      await this.lineRepo.save(line);
      link.status = fullyReceived ? SupplyLinkStatus.FULFILLED : SupplyLinkStatus.RECEIVED;
      await this.maybeAdvanceOrder(tenantId, link.salesOrderId);
    } else {
      link.status = fullyReceived ? SupplyLinkStatus.RECEIVED : SupplyLinkStatus.ORDERED;
    }
    await this.linkRepo.save(link);
    return { link, line };
  }

  async cancelLink(tenantId: string, id: string): Promise<SupplyLink> {
    const link = await this.getLink(tenantId, id);
    if (link.status === SupplyLinkStatus.FULFILLED) throw new BadRequestException('Fulfilled links cannot be cancelled');
    link.status = SupplyLinkStatus.CANCELLED;
    return (this.linkRepo.save(link) as unknown) as Promise<SupplyLink>;
  }

  /** If every line on the order is FULFILLED, nudge order fulfilment status. */
  private async maybeAdvanceOrder(tenantId: string, salesOrderId: string): Promise<void> {
    const order = await this.orderRepo.findOne({ where: { id: salesOrderId, tenantId } });
    if (!order) return;
    const lines = await this.lineRepo.find({ where: { tenantId, orderId: salesOrderId } });
    const allFulfilled = lines.length > 0 && lines.every((l) => l.status === LineStatus.FULFILLED);
    const anyShipped = lines.some((l) => Number(l.qtyShipped) > 0);
    (order as any).fulfilmentStatus = allFulfilled ? 'FULFILLED' : anyShipped ? 'PARTIAL' : 'PENDING';
    await this.orderRepo.save(order);
  }

  private async getLink(tenantId: string, id: string): Promise<SupplyLink> {
    const link = await this.linkRepo.findOne({ where: { id, tenantId } });
    if (!link) throw new NotFoundException(`Supply link ${id} not found`);
    return link;
  }

  // ─── reporting ────────────────────────────────────────────────────

  async openSupplyDashboard(tenantId: string): Promise<any> {
    const links = await this.linkRepo.find({
      where: [
        { tenantId, status: SupplyLinkStatus.REQUESTED },
        { tenantId, status: SupplyLinkStatus.ORDERED },
        { tenantId, status: SupplyLinkStatus.RECEIVED },
      ],
    });
    const byType: Record<string, number> = { DROP_SHIP: 0, BACK_TO_BACK: 0 };
    const byStatus: Record<string, number> = {};
    for (const l of links) {
      byType[l.supplyType] = (byType[l.supplyType] ?? 0) + 1;
      byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    }
    return { open: links.length, byType, byStatus, links };
  }
}
