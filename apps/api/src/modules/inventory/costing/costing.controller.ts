import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CostingService } from './costing.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { VarianceType } from './entities/cost-variance.entity';

@ApiTags('inventory-costing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/costing')
export class CostingController {
  constructor(private readonly service: CostingService) {}

  // ─── Ph-137: WAC preview ──────────────────────────────────────────
  @Post('wac-preview')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Preview moving-average roll for given inputs' })
  wacPreview(@CurrentUser() _u: any, @Body() b: { currentQty: number; currentAvg: number; receiptQty: number; receiptUnitCost: number }) {
    return this.service.computeMovingAverage(b.currentQty, b.currentAvg, b.receiptQty, b.receiptUnitCost);
  }

  // ─── Ph-138: standard cost ────────────────────────────────────────
  @Get('standard-costs')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'itemId', required: false })
  listStandardCosts(@CurrentUser() u: any, @Query('itemId') itemId?: string) {
    return this.service.listStandardCosts(u.tenantId, itemId);
  }

  @Post('standard-costs')
  @RequirePermission('inventory:manage')
  setStandardCost(@CurrentUser() u: any, @Body() b: any) {
    return this.service.setStandardCost(u.tenantId, b);
  }

  @Post('ppv')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Record a purchase price variance at receipt' })
  recordPpv(@CurrentUser() u: any, @Body() b: any) {
    return this.service.recordPpv(u.tenantId, b);
  }

  @Post('variances')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Record a production variance (MUV/LRV/SUV)' })
  recordVariance(@CurrentUser() u: any, @Body() b: any) {
    return this.service.recordVariance(u.tenantId, b);
  }

  // ─── Ph-139: cost update ──────────────────────────────────────────
  @Get('cost-updates')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'itemId', required: false })
  listCostUpdates(@CurrentUser() u: any, @Query('itemId') itemId?: string) {
    return this.service.listCostUpdates(u.tenantId, itemId);
  }

  @Post('cost-updates')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Run a standard cost update; revalues inventory and posts JE' })
  costUpdate(@CurrentUser() u: any, @Body() b: any) {
    return this.service.costUpdate(u.tenantId, b, u.id);
  }

  // ─── Ph-140: variance dashboard ───────────────────────────────────
  @Get('variances')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'varianceType', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  listVariances(@CurrentUser() u: any, @Query('varianceType') varianceType?: VarianceType, @Query('itemId') itemId?: string) {
    return this.service.listVariances(u.tenantId, { varianceType, itemId });
  }

  @Get('variance-dashboard')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Variance analysis: by type, item, vendor' })
  dashboard(@CurrentUser() u: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.varianceDashboard(u.tenantId, { from, to });
  }
}
