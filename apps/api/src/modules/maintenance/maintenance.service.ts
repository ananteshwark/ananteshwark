import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Equipment } from './entities/equipment.entity';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import { MaintenanceOrder, MaintenanceOrderStatus, MaintenanceOrderType } from './entities/maintenance-order.entity';
import { BreakdownNotification, BreakdownStatus } from './entities/breakdown-notification.entity';
import {
  CreateEquipmentDto, UpdateEquipmentDto, CreateMaintenancePlanDto,
  CreateMaintenanceOrderDto, CompleteMaintenanceOrderDto, CreateBreakdownNotificationDto,
} from './dto/maintenance.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(Equipment) private readonly equipmentRepo: Repository<Equipment>,
    @InjectRepository(MaintenancePlan) private readonly planRepo: Repository<MaintenancePlan>,
    @InjectRepository(MaintenanceOrder) private readonly orderRepo: Repository<MaintenanceOrder>,
    @InjectRepository(BreakdownNotification) private readonly breakdownRepo: Repository<BreakdownNotification>,
  ) {}

  // ---- Equipment ----
  async createEquipment(tenantId: string, dto: CreateEquipmentDto): Promise<Equipment> {
    return this.equipmentRepo.save(this.equipmentRepo.create({ ...dto, tenantId }));
  }

  async listEquipment(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<Equipment>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.equipmentRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateEquipment(tenantId: string, id: string, dto: UpdateEquipmentDto): Promise<Equipment> {
    const equipment = await this.equipmentRepo.findOne({ where: { tenantId, id } });
    if (!equipment) throw new NotFoundException(`Equipment ${id} not found`);
    Object.assign(equipment, dto);
    return this.equipmentRepo.save(equipment);
  }

  // ---- Maintenance Plans ----
  async createPlan(tenantId: string, dto: CreateMaintenancePlanDto): Promise<MaintenancePlan> {
    return this.planRepo.save(this.planRepo.create({ ...dto, tenantId }));
  }

  async listPlans(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<MaintenancePlan>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.planRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // ---- Maintenance Orders ----
  private async nextOrderNumber(tenantId: string): Promise<string> {
    const row = await this.orderRepo
      .createQueryBuilder('o')
      .select(`MAX(CAST(NULLIF(regexp_replace(o.order_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('o.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `MO-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createOrder(tenantId: string, dto: CreateMaintenanceOrderDto): Promise<MaintenanceOrder> {
    const orderNumber = await this.nextOrderNumber(tenantId);
    return this.orderRepo.save(this.orderRepo.create({ ...dto, tenantId, orderNumber }));
  }

  async listOrders(tenantId: string, pagination: PaginationDto, status?: string): Promise<PaginatedResponseDto<MaintenanceOrder>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.orderRepo.createQueryBuilder('o').where('o.tenantId = :tenantId', { tenantId });
    if (status) qb.andWhere('o.status = :status', { status });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async startOrder(tenantId: string, id: string): Promise<MaintenanceOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id } });
    if (!order) throw new NotFoundException(`Maintenance order ${id} not found`);
    if (order.status !== MaintenanceOrderStatus.OPEN) {
      throw new BadRequestException('Only OPEN orders can be started');
    }
    order.status = MaintenanceOrderStatus.IN_PROGRESS;
    order.actualStartDate = new Date().toISOString().slice(0, 10);
    return this.orderRepo.save(order);
  }

  async completeOrder(tenantId: string, id: string, dto: CompleteMaintenanceOrderDto): Promise<MaintenanceOrder> {
    const order = await this.orderRepo.findOne({ where: { tenantId, id } });
    if (!order) throw new NotFoundException(`Maintenance order ${id} not found`);
    if (order.status !== MaintenanceOrderStatus.IN_PROGRESS) {
      throw new BadRequestException('Only IN_PROGRESS orders can be completed');
    }
    order.status = MaintenanceOrderStatus.COMPLETED;
    order.actualEndDate = dto.actualEndDate;
    order.laborHours = dto.laborHours ?? null;
    order.notes = dto.notes ?? order.notes;
    return this.orderRepo.save(order);
  }

  // ---- Breakdown Notifications ----
  async createBreakdownNotification(tenantId: string, dto: CreateBreakdownNotificationDto, reportedById: string): Promise<BreakdownNotification> {
    return this.breakdownRepo.save(this.breakdownRepo.create({ ...dto, tenantId, reportedById }));
  }

  async listBreakdownNotifications(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<BreakdownNotification>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.breakdownRepo.findAndCount({
      where: { tenantId },
      order: { reportedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async createOrderFromBreakdown(tenantId: string, notificationId: string): Promise<MaintenanceOrder> {
    const notification = await this.breakdownRepo.findOne({ where: { tenantId, id: notificationId } });
    if (!notification) throw new NotFoundException(`Breakdown notification ${notificationId} not found`);
    if (notification.status !== BreakdownStatus.OPEN) {
      throw new BadRequestException('Notification is already assigned or resolved');
    }
    const orderNumber = await this.nextOrderNumber(tenantId);
    const order = await this.orderRepo.save(
      this.orderRepo.create({
        tenantId,
        orderNumber,
        equipmentId: notification.equipmentId,
        type: MaintenanceOrderType.BREAKDOWN,
        description: notification.description,
        status: MaintenanceOrderStatus.OPEN,
      }),
    );
    notification.status = BreakdownStatus.ASSIGNED;
    notification.maintenanceOrderId = order.id;
    await this.breakdownRepo.save(notification);
    return order;
  }
}
