import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LogisticsService } from './logistics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ShipmentPlanStatus } from './entities/shipment-plan.entity';

@ApiTags('logistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly service: LogisticsService) {}

  // ─── Ph-151: carriers ─────────────────────────────────────────────
  @Get('carriers')
  @RequirePermission('inventory:read')
  listCarriers(@CurrentUser() u: any) { return this.service.listCarriers(u.tenantId); }

  @Post('carriers')
  @RequirePermission('inventory:manage')
  createCarrier(@CurrentUser() u: any, @Body() b: any) { return this.service.createCarrier(u.tenantId, b); }

  @Patch('carriers/:id')
  @RequirePermission('inventory:manage')
  updateCarrier(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateCarrier(u.tenantId, id, b); }

  // ─── Ph-152: rates + rate shopping ────────────────────────────────
  @Get('rates')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'carrierId', required: false })
  listRates(@CurrentUser() u: any, @Query('carrierId') carrierId?: string) { return this.service.listRates(u.tenantId, carrierId); }

  @Post('rates')
  @RequirePermission('inventory:manage')
  createRate(@CurrentUser() u: any, @Body() b: any) { return this.service.createRate(u.tenantId, b); }

  @Post('rate-shop')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Rate-shop carriers for a lane + weight (cheapest first)' })
  rateShop(@CurrentUser() u: any, @Body() b: { originZone: string; destZone: string; weight: number }) {
    return this.service.rateShop(u.tenantId, b);
  }

  // ─── Ph-153: shipment planning ────────────────────────────────────
  @Get('shipments')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'status', required: false })
  listPlans(@CurrentUser() u: any, @Query('status') status?: ShipmentPlanStatus) { return this.service.listPlans(u.tenantId, status); }

  @Post('shipments')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Plan a shipment (auto-selects cheapest carrier, computes utilization)' })
  planShipment(@CurrentUser() u: any, @Body() b: any) { return this.service.planShipment(u.tenantId, b); }

  @Post('shipments/:id/status')
  @RequirePermission('inventory:manage')
  transition(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { status: ShipmentPlanStatus }) {
    return this.service.transitionPlan(u.tenantId, id, b.status);
  }

  // ─── Ph-154: freight audit ────────────────────────────────────────
  @Post('shipments/:id/freight-audit')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Audit carrier invoice against planned freight' })
  freightAudit(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { invoicedAmount: number; tolerancePct?: number }) {
    return this.service.freightAudit(u.tenantId, id, b.invoicedAmount, b.tolerancePct);
  }
}
