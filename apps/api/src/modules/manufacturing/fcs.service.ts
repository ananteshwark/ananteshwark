import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { CapacitySlot, SlotStatus } from './entities/capacity-slot.entity';
import { ProductionOrder } from './entities/production-order.entity';
import { WorkCenter } from './entities/work-center.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { Routing } from './entities/routing.entity';
import { Item } from '../inventory/entities/item.entity';

@Injectable()
export class FcsService {
  constructor(
    @InjectRepository(CapacitySlot) private readonly slotRepo: Repository<CapacitySlot>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(WorkCenter) private readonly wcRepo: Repository<WorkCenter>,
    @InjectRepository(RoutingOperation) private readonly routingOpRepo: Repository<RoutingOperation>,
    @InjectRepository(Routing) private readonly routingRepo: Repository<Routing>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
  ) {}

  private minutesToMs(mins: number): number {
    return mins * 60 * 1000;
  }

  private availableMinutesPerDay(wc: WorkCenter): number {
    return wc.capacityMinutesPerDay ?? Math.round(Number(wc.capacityPerHour ?? 0) * 8 * 60);
  }

  /** Find the earliest start time at a work center after startAt that fits loadMinutes within daily capacity */
  private async findNextSlot(
    tenantId: string,
    workCenterId: string,
    startAt: Date,
    loadMinutes: number,
  ): Promise<Date> {
    const wc = await this.wcRepo.findOne({ where: { id: workCenterId } });
    const dailyCap = wc ? this.availableMinutesPerDay(wc) : 480;

    let candidate = new Date(startAt);
    // Work on 8am-based day slots
    candidate.setHours(8, 0, 0, 0);
    if (candidate < startAt) {
      candidate = new Date(candidate.getTime() + 86400000); // next day
    }

    for (let attempt = 0; attempt < 90; attempt++) {
      const dayStart = new Date(candidate);
      const dayEnd = new Date(dayStart.getTime() + this.minutesToMs(dailyCap));

      // Sum existing load for this WC on this day
      const daySlots = await this.slotRepo
        .createQueryBuilder('s')
        .where('s.tenantId = :tenantId', { tenantId })
        .andWhere('s.workCenterId = :wcId', { wcId: workCenterId })
        .andWhere('s.scheduledStart >= :dayStart', { dayStart })
        .andWhere('s.scheduledStart < :dayEnd', { dayEnd })
        .andWhere('s.status NOT IN (:...cancelled)', { cancelled: [SlotStatus.CANCELLED] })
        .select('SUM(s.loadMinutes + s.setupMinutes)', 'usedMins')
        .getRawOne();

      const usedMins = Number(daySlots?.usedMins ?? 0);
      const remaining = dailyCap - usedMins;

      if (remaining >= loadMinutes) {
        // Schedule at end of existing slots
        const slotStart = new Date(dayStart.getTime() + this.minutesToMs(usedMins));
        return slotStart;
      }

      // Move to next day
      candidate = new Date(candidate.getTime() + 86400000);
    }

    return candidate; // fallback
  }

  async scheduleOrder(tenantId: string, orderId: string): Promise<CapacitySlot[]> {
    const order = await this.orderRepo.findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException(`Production order ${orderId} not found`);

    // Remove any existing SCHEDULED slots for this order first
    await this.slotRepo
      .createQueryBuilder()
      .delete()
      .where('tenantId = :tenantId AND productionOrderId = :orderId AND status = :s',
        { tenantId, orderId, s: SlotStatus.SCHEDULED })
      .execute();

    const startAt = new Date(order.plannedStartDate);

    // Try to find routing for the item
    const item = await this.itemRepo.findOne({ where: { tenantId, code: order.finishedItemCode } });
    let operations: RoutingOperation[] = [];
    if (item) {
      const routing = await this.routingRepo.findOne({ where: { tenantId, itemId: item.id, isActive: true } });
      if (routing) {
        operations = await this.routingOpRepo.find({
          where: { tenantId, routingId: routing.id },
          order: { sequence: 'ASC' },
        });
      }
    }

    const createdSlots: CapacitySlot[] = [];

    if (operations.length > 0) {
      let current = startAt;
      for (const op of operations) {
        const loadMins = Math.round(Number(op.runMinutesPerUnit) * Number(order.plannedQuantity));
        const setupMins = op.setupMinutes ?? 0;
        const totalMins = loadMins + setupMins;
        const slotStart = await this.findNextSlot(tenantId, op.workCenterId, current, totalMins);
        const slotEnd = new Date(slotStart.getTime() + this.minutesToMs(totalMins));

        const slot = this.slotRepo.create({
          tenantId,
          workCenterId: op.workCenterId,
          productionOrderId: orderId,
          operationId: op.id,
          operationName: op.description ?? `Op ${op.sequence}`,
          scheduledStart: slotStart,
          scheduledEnd: slotEnd,
          loadMinutes: loadMins,
          setupMinutes: setupMins,
        } as any);
        const saved = await this.slotRepo.save(slot);
        createdSlots.push(saved as unknown as CapacitySlot);
        current = slotEnd;
      }
    } else if (order.workCenterId) {
      // Single-WC schedule using order's direct work center
      const wc = await this.wcRepo.findOne({ where: { id: order.workCenterId } });
      const dailyCap = wc ? this.availableMinutesPerDay(wc) : 480;
      const slotStart = await this.findNextSlot(tenantId, order.workCenterId, startAt, dailyCap);
      const slotEnd = new Date(slotStart.getTime() + this.minutesToMs(dailyCap));

      const slot = this.slotRepo.create({
        tenantId,
        workCenterId: order.workCenterId,
        productionOrderId: orderId,
        scheduledStart: slotStart,
        scheduledEnd: slotEnd,
        loadMinutes: dailyCap,
        setupMinutes: 0,
      } as any);
      const saved = await this.slotRepo.save(slot);
      createdSlots.push(saved as unknown as CapacitySlot);
    } else {
      throw new BadRequestException('Production order has no work center or active routing');
    }

    return createdSlots;
  }

  async getCapacityLoad(tenantId: string, workCenterId: string, from: string, to: string): Promise<any[]> {
    const wc = await this.wcRepo.findOne({ where: { id: workCenterId } });
    if (!wc) throw new NotFoundException(`Work center ${workCenterId} not found`);
    const dailyCap = this.availableMinutesPerDay(wc);

    const slots = await this.slotRepo
      .createQueryBuilder('s')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.workCenterId = :wcId', { wcId: workCenterId })
      .andWhere('DATE(s.scheduledStart) >= :from', { from })
      .andWhere('DATE(s.scheduledStart) <= :to', { to })
      .andWhere('s.status NOT IN (:...cancelled)', { cancelled: [SlotStatus.CANCELLED] })
      .orderBy('s.scheduledStart', 'ASC')
      .getMany();

    // Group by date
    const byDate = new Map<string, { loadMinutes: number; setupMinutes: number; slots: any[] }>();
    for (const s of slots) {
      const dateKey = s.scheduledStart.toISOString().split('T')[0];
      if (!byDate.has(dateKey)) byDate.set(dateKey, { loadMinutes: 0, setupMinutes: 0, slots: [] });
      byDate.get(dateKey)!.loadMinutes += s.loadMinutes;
      byDate.get(dateKey)!.setupMinutes += s.setupMinutes;
      byDate.get(dateKey)!.slots.push(s);
    }

    return Array.from(byDate.entries()).map(([date, data]) => ({
      date,
      availableMinutes: dailyCap,
      loadMinutes: data.loadMinutes,
      setupMinutes: data.setupMinutes,
      totalUsed: data.loadMinutes + data.setupMinutes,
      utilizationPct: Math.round(((data.loadMinutes + data.setupMinutes) / dailyCap) * 100),
      overloaded: (data.loadMinutes + data.setupMinutes) > dailyCap,
      slots: data.slots,
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  async getOrderSlots(tenantId: string, orderId: string): Promise<CapacitySlot[]> {
    return this.slotRepo.find({ where: { tenantId, productionOrderId: orderId }, order: { scheduledStart: 'ASC' } });
  }

  async listAllCapacityLoads(tenantId: string, from: string, to: string): Promise<any[]> {
    const workCenters = await this.wcRepo.find({ where: { tenantId } });
    const results = await Promise.all(
      workCenters.map(wc => this.getCapacityLoad(tenantId, wc.id, from, to).then(load => ({
        workCenter: { id: wc.id, name: wc.name },
        load,
      })))
    );
    return results.filter(r => r.load.length > 0);
  }

  async updateSlotStatus(tenantId: string, slotId: string, status: SlotStatus): Promise<CapacitySlot> {
    const slot = await this.slotRepo.findOne({ where: { id: slotId, tenantId } });
    if (!slot) throw new NotFoundException(`Capacity slot ${slotId} not found`);
    slot.status = status;
    return this.slotRepo.save(slot);
  }
}
