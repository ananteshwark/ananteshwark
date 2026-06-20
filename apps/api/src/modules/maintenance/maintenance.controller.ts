import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateEquipmentDto, UpdateEquipmentDto, CreateMaintenancePlanDto,
  CreateMaintenanceOrderDto, CompleteMaintenanceOrderDto, CreateBreakdownNotificationDto,
} from './dto/maintenance.dto';

@ApiTags('maintenance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  // Equipment
  @Get('equipment')
  @RequirePermission('maintenance:read')
  listEquipment(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listEquipment(user.tenantId, pagination);
  }

  @Post('equipment')
  @RequirePermission('maintenance:manage')
  createEquipment(@CurrentUser() user: any, @Body() dto: CreateEquipmentDto) {
    return this.service.createEquipment(user.tenantId, dto);
  }

  @Patch('equipment/:id')
  @RequirePermission('maintenance:manage')
  updateEquipment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.service.updateEquipment(user.tenantId, id, dto);
  }

  // Maintenance Plans
  // Declared before 'plans' detail routes so the literal 'due' path resolves.
  @Get('plans/due')
  @RequirePermission('maintenance:read')
  getDuePlans(@CurrentUser() user: any) {
    return this.service.getDuePlans(user.tenantId);
  }

  @Get('plans')
  @RequirePermission('maintenance:read')
  listPlans(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPlans(user.tenantId, pagination);
  }

  @Post('plans')
  @RequirePermission('maintenance:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateMaintenancePlanDto) {
    return this.service.createPlan(user.tenantId, dto);
  }

  // Maintenance Orders
  @Get('orders')
  @RequirePermission('maintenance:read')
  listOrders(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.service.listOrders(user.tenantId, pagination, status);
  }

  @Post('orders')
  @RequirePermission('maintenance:manage')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateMaintenanceOrderDto) {
    return this.service.createOrder(user.tenantId, dto);
  }

  @Post('orders/:id/start')
  @RequirePermission('maintenance:manage')
  startOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.startOrder(user.tenantId, id);
  }

  @Post('orders/:id/complete')
  @RequirePermission('maintenance:manage')
  completeOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CompleteMaintenanceOrderDto) {
    return this.service.completeOrder(user.tenantId, id, dto);
  }

  // Breakdown Notifications
  @Get('breakdown-notifications')
  @RequirePermission('maintenance:read')
  listBreakdownNotifications(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listBreakdownNotifications(user.tenantId, pagination);
  }

  @Post('breakdown-notifications')
  @RequirePermission('maintenance:manage')
  createBreakdownNotification(@CurrentUser() user: any, @Body() dto: CreateBreakdownNotificationDto) {
    return this.service.createBreakdownNotification(user.tenantId, dto, user.id);
  }

  @Post('breakdown-notifications/:id/create-order')
  @RequirePermission('maintenance:manage')
  createOrderFromBreakdown(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.createOrderFromBreakdown(user.tenantId, id);
  }
}
