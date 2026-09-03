import {
  Controller, Get, Post, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DeliveryService } from './delivery.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/deliveries')
export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Get()
  @RequirePermission('sales:orders:read')
  list(
    @CurrentUser() user: any,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.list(user.tenantId, { salesOrderId, status });
  }

  @Get(':id')
  @RequirePermission('sales:orders:read')
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getOne(user.tenantId, id);
  }

  @Post()
  @RequirePermission('sales:orders:create')
  create(
    @CurrentUser() user: any,
    @Body() body: { salesOrderId: string; deliveryDate?: string; warehouseId?: string | null },
  ) {
    return this.service.createFromSalesOrder(user.tenantId, body.salesOrderId, {
      deliveryDate: body.deliveryDate,
      warehouseId: body.warehouseId ?? null,
    });
  }

  @Post(':id/pick')
  @RequirePermission('sales:orders:update')
  pick(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.pick(user.tenantId, id);
  }

  @Post(':id/goods-issue')
  @RequirePermission('sales:orders:update')
  async goodsIssue(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body?: { carrier?: string | null; trackingNumber?: string | null },
  ) {
    if (body && (body.carrier !== undefined || body.trackingNumber !== undefined)) {
      await this.service.setShipmentInfo(user.tenantId, id, body);
    }
    return this.service.goodsIssue(user.tenantId, id);
  }

  @Post(':id/confirm-pod')
  @RequirePermission('sales:orders:update')
  async confirmPod(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body?: { note?: string; carrier?: string | null; trackingNumber?: string | null },
  ) {
    if (body && (body.carrier !== undefined || body.trackingNumber !== undefined)) {
      await this.service.setShipmentInfo(user.tenantId, id, body);
    }
    return this.service.confirmPod(user.tenantId, id, { note: body?.note });
  }

  @Post(':id/cancel')
  @RequirePermission('sales:orders:update')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.tenantId, id);
  }
}
