import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryOrder, DeliveryStatus } from './entities/delivery-order.entity';
import { DeliveryLine } from './entities/delivery-line.entity';
import { SalesOrder, SalesOrderStatus, FulfilmentStatus } from './entities/sales-order.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AtpService } from './atp.service';

export interface CreateDeliveryDto {
  salesOrderId: string;
  deliveryDate?: string;
  warehouseId?: string | null;
}

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryOrder)
    private readonly deliveryRepo: Repository<DeliveryOrder>,
    @InjectRepository(DeliveryLine)
    private readonly lineRepo: Repository<DeliveryLine>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderLine)
    private readonly orderLineRepo: Repository<SalesOrderLine>,
    private readonly inventoryService: InventoryService,
    private readonly atpService: AtpService,
  ) {}

  private async nextDeliveryNumber(tenantId: string): Promise<string> {
    const row = await this.deliveryRepo
      .createQueryBuilder('d')
      .select(`MAX(CAST(NULLIF(regexp_replace(d.delivery_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('d.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `DEL-${String(next).padStart(4, '0')}`;
  }

  async createFromSalesOrder(tenantId: string, salesOrderId: string, opts: { deliveryDate?: string; warehouseId?: string | null }): Promise<DeliveryOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id: salesOrderId } });
    if (!order) throw new NotFoundException(`Sales order ${salesOrderId} not found`);

    const orderLines = await this.orderLineRepo.find({
      where: { tenantId, orderId: salesOrderId },
      order: { lineNumber: 'ASC' },
    });

    const deliveryNumber = await this.nextDeliveryNumber(tenantId);
    const delivery = await this.deliveryRepo.save(
      this.deliveryRepo.create({
        tenantId,
        deliveryNumber,
        salesOrderId,
        customerId: order.customerId,
        customerName: order.contactName,
        deliveryDate: opts.deliveryDate || new Date().toISOString().slice(0, 10),
        status: DeliveryStatus.DRAFT,
        warehouseId: opts.warehouseId ?? null,
      }),
    );

    const lineEntities = orderLines.map((l) =>
      this.lineRepo.create({
        tenantId,
        deliveryOrderId: delivery.id,
        salesOrderLineId: l.id,
        itemId: l.inventoryItemId,
        itemDescription: l.itemName,
        orderedQty: l.quantity,
        deliveredQty: l.quantity,
        warehouseId: opts.warehouseId ?? null,
        lotId: null,
      }),
    );
    if (lineEntities.length) await this.lineRepo.save(lineEntities);
    return delivery;
  }

  async list(tenantId: string, filters?: { salesOrderId?: string; status?: string }): Promise<DeliveryOrder[]> {
    const qb = this.deliveryRepo.createQueryBuilder('d').where('d.tenantId = :tenantId', { tenantId });
    if (filters?.salesOrderId) qb.andWhere('d.salesOrderId = :soid', { soid: filters.salesOrderId });
    if (filters?.status) qb.andWhere('d.status = :status', { status: filters.status });
    qb.orderBy('d.createdAt', 'DESC');
    return qb.getMany();
  }

  async getOne(tenantId: string, id: string): Promise<DeliveryOrder & { lines: DeliveryLine[] }> {
    const delivery = await this.deliveryRepo.findOne({ where: { tenantId, id } });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);
    const lines = await this.lineRepo.find({ where: { tenantId, deliveryOrderId: id }, order: { createdAt: 'ASC' } });
    return Object.assign(delivery, { lines });
  }

  private async findOne(tenantId: string, id: string): Promise<DeliveryOrder> {
    const delivery = await this.deliveryRepo.findOne({ where: { tenantId, id } });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);
    return delivery;
  }

  async pick(tenantId: string, id: string): Promise<DeliveryOrder> {
    const delivery = await this.findOne(tenantId, id);
    if (delivery.status !== DeliveryStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT deliveries can be picked');
    }
    // Allocation step. Lot/bin selection kept simple — nothing more to do here.
    delivery.status = DeliveryStatus.PICKED;
    return this.deliveryRepo.save(delivery);
  }

  async goodsIssue(tenantId: string, id: string): Promise<DeliveryOrder> {
    const delivery = await this.findOne(tenantId, id);
    if (delivery.status !== DeliveryStatus.PICKED) {
      throw new BadRequestException('Delivery must be PICKED to issue goods');
    }

    const lines = await this.lineRepo.find({ where: { tenantId, deliveryOrderId: id } });

    for (const line of lines) {
      const qty = Number(line.deliveredQty) || 0;
      const warehouseId = line.warehouseId || delivery.warehouseId;
      if (!line.itemId || !warehouseId || qty <= 0) continue;
      // ISSUE / deduct stock — best-effort, never crash goods issue.
      try {
        await this.inventoryService.issueStock(
          tenantId,
          line.itemId,
          warehouseId,
          qty,
          'DELIVERY',
          delivery.id,
          delivery.deliveryDate,
          `Goods issue for delivery ${delivery.deliveryNumber}`,
        );
      } catch (_) {
        // Stock issue is best-effort.
      }
      // Release any ATP commitment for the item.
      try {
        await this.atpService.releaseForItem(tenantId, line.itemId, qty);
      } catch (_) {
        // Best-effort release.
      }
    }

    delivery.status = DeliveryStatus.SHIPPED;
    const saved = await this.deliveryRepo.save(delivery);

    // Nudge linked sales order toward shipped (best-effort).
    try {
      const order = await this.orderRepo.findOne({ where: { tenantId, id: delivery.salesOrderId } });
      if (order && [SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS].includes(order.status)) {
        order.status = SalesOrderStatus.SHIPPED;
        if (!order.shippedDate) order.shippedDate = delivery.deliveryDate;
        order.fulfilmentStatus = FulfilmentStatus.FULFILLED;
        await this.orderRepo.save(order);
      }
    } catch (_) {
      // Don't break delivery flow on SO update.
    }

    return saved;
  }

  async confirmPod(tenantId: string, id: string, opts: { note?: string }): Promise<DeliveryOrder> {
    const delivery = await this.findOne(tenantId, id);
    if (delivery.status !== DeliveryStatus.SHIPPED) {
      throw new BadRequestException('Delivery must be SHIPPED to confirm POD');
    }
    delivery.status = DeliveryStatus.DELIVERED;
    delivery.podConfirmedAt = new Date();
    if (opts.note !== undefined) delivery.podNote = opts.note;
    const saved = await this.deliveryRepo.save(delivery);

    // Optionally nudge SO to completed (best-effort).
    try {
      const order = await this.orderRepo.findOne({ where: { tenantId, id: delivery.salesOrderId } });
      if (order && order.status === SalesOrderStatus.SHIPPED) {
        order.status = SalesOrderStatus.COMPLETED;
        order.fulfilmentStatus = FulfilmentStatus.FULFILLED;
        await this.orderRepo.save(order);
      }
    } catch (_) {
      // Best-effort.
    }

    return saved;
  }

  async setShipmentInfo(tenantId: string, id: string, opts: { carrier?: string | null; trackingNumber?: string | null }): Promise<DeliveryOrder> {
    const delivery = await this.findOne(tenantId, id);
    if (opts.carrier !== undefined) delivery.carrier = opts.carrier;
    if (opts.trackingNumber !== undefined) delivery.trackingNumber = opts.trackingNumber;
    return this.deliveryRepo.save(delivery);
  }

  async cancel(tenantId: string, id: string): Promise<DeliveryOrder> {
    const delivery = await this.findOne(tenantId, id);
    if ([DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED].includes(delivery.status)) {
      throw new BadRequestException('Cannot cancel a delivered or already cancelled delivery');
    }
    delivery.status = DeliveryStatus.CANCELLED;
    return this.deliveryRepo.save(delivery);
  }
}
