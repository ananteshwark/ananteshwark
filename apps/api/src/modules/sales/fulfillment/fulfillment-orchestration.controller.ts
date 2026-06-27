import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { FulfillmentOrchestrationService } from './fulfillment-orchestration.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SupplyLinkStatus, SupplyType } from './entities/supply-link.entity';

@ApiTags('sales-fulfillment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/fulfillment')
export class FulfillmentOrchestrationController {
  constructor(private readonly service: FulfillmentOrchestrationService) {}

  @Get('supply-links')
  @RequirePermission('sales:read')
  @ApiQuery({ name: 'salesOrderId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'supplyType', required: false })
  list(
    @CurrentUser() u: any,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: SupplyLinkStatus,
    @Query('supplyType') supplyType?: SupplyType,
  ) {
    return this.service.list(u.tenantId, { salesOrderId, status, supplyType });
  }

  @Get('dashboard')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Open supply links dashboard' })
  dashboard(@CurrentUser() u: any) {
    return this.service.openSupplyDashboard(u.tenantId);
  }

  @Post('supply-links')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Create a drop-ship or back-to-back supply link for a SO line' })
  create(@CurrentUser() u: any, @Body() b: any) {
    return this.service.createSupplyLink(u.tenantId, b);
  }

  @Post('supply-links/:id/order')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Attach the created supply document (PO / production order)' })
  markOrdered(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) {
    return this.service.markOrdered(u.tenantId, id, b);
  }

  @Post('supply-links/:id/receive')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Receive supply; drop-ship receipts relieve the SO line' })
  receive(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { receiptQty: number }) {
    return this.service.receiveSupply(u.tenantId, id, b.receiptQty);
  }

  @Post('supply-links/:id/cancel')
  @RequirePermission('sales:manage')
  cancel(@CurrentUser() u: any, @Param('id') id: string) {
    return this.service.cancelLink(u.tenantId, id);
  }
}
