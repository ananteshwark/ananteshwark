import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ForecastingService } from './forecasting.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('crm-forecasting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm/forecasting')
export class ForecastingController {
  constructor(private readonly service: ForecastingService) {}

  // ─── Ph-214: categories ───────────────────────────────────────────
  @Post('categories')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Assign a forecast category to an opportunity' })
  assignCategory(@CurrentUser() u: any, @Body() b: any) { return this.service.assignCategory(u.tenantId, b); }

  @Get('categories')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'period', required: true })
  listCategories(@CurrentUser() u: any, @Query('period') period: string) { return this.service.listCategories(u.tenantId, period); }

  // ─── Ph-215: roll-up + override ───────────────────────────────────
  @Get('rollup')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Manager forecast roll-up by owner for a period' })
  @ApiQuery({ name: 'period', required: true })
  rollup(@CurrentUser() u: any, @Query('period') period: string) { return this.service.rollup(u.tenantId, period); }

  @Post('override')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Manager override of a rep commit forecast' })
  setOverride(@CurrentUser() u: any, @Body() b: any) { return this.service.setOverride(u.tenantId, { ...b, managerId: b.managerId ?? u.id }); }

  // ─── Ph-216: accuracy & win rate ──────────────────────────────────
  @Post('snapshot')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Snapshot the current forecast for accuracy tracking' })
  snapshot(@CurrentUser() u: any, @Body() b: { period: string; snapshotDate: string }) { return this.service.snapshot(u.tenantId, b.period, b.snapshotDate); }

  @Get('accuracy')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'period', required: true })
  accuracy(@CurrentUser() u: any, @Query('period') period: string) { return this.service.accuracy(u.tenantId, period); }

  @Get('win-rate')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'period', required: false })
  winRate(@CurrentUser() u: any, @Query('period') period?: string) { return this.service.winRate(u.tenantId, period); }
}
