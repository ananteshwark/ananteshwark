import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { ControllingService } from './controlling.service';

@ApiTags('finance-controlling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance/controlling')
export class ControllingController {
  constructor(private readonly controllingService: ControllingService) {}

  // ─── Profit Centers ──────────────────────────────────────────────────────

  @Get('profit-centers')
  @ApiOperation({ summary: 'List profit centers' })
  listProfitCenters(@CurrentUser() user: any) {
    return this.controllingService.listProfitCenters(user.tenantId);
  }

  @Post('profit-centers')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create profit center' })
  createProfitCenter(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.createProfitCenter(user.tenantId, dto);
  }

  @Patch('profit-centers/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update profit center' })
  updateProfitCenter(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.controllingService.updateProfitCenter(user.tenantId, id, dto);
  }

  @Get('profit-centers/:id/pl')
  @ApiOperation({ summary: 'Get P&L for a profit center' })
  profitCenterPL(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.controllingService.profitCenterPL(user.tenantId, id, fromDate, toDate);
  }

  // ─── Allocation Cycles ───────────────────────────────────────────────────

  @Get('allocation-cycles')
  @ApiOperation({ summary: 'List allocation cycles' })
  listAllocationCycles(@CurrentUser() user: any) {
    return this.controllingService.listAllocationCycles(user.tenantId);
  }

  @Post('allocation-cycles')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create allocation cycle' })
  createAllocationCycle(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.createAllocationCycle(user.tenantId, dto);
  }

  @Post('allocation-cycles/:id/run')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Run allocation cycle for a period (YYYY-MM)' })
  runAllocationCycle(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('period') period: string,
  ) {
    return this.controllingService.runAllocationCycle(user.tenantId, id, period);
  }

  // ─── Cost Center Reporting ───────────────────────────────────────────────

  @Get('cost-centers/report')
  @ApiOperation({ summary: 'Cost center actual vs budget report for a period (YYYY-MM)' })
  costCenterReport(@CurrentUser() user: any, @Query('period') period: string) {
    return this.controllingService.costCenterReport(user.tenantId, period);
  }

  // ─── Internal Orders ────────────────────────────────────────────────────

  @Get('internal-orders')
  @ApiOperation({ summary: 'List internal orders' })
  listInternalOrders(@CurrentUser() user: any) {
    return this.controllingService.listInternalOrders(user.tenantId);
  }

  @Get('internal-orders/:id')
  @ApiOperation({ summary: 'Get internal order' })
  getInternalOrder(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.controllingService.getInternalOrder(user.tenantId, id);
  }

  @Post('internal-orders')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create internal order' })
  createInternalOrder(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.createInternalOrder(user.tenantId, dto);
  }

  @Patch('internal-orders/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update internal order' })
  updateInternalOrder(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.controllingService.updateInternalOrder(user.tenantId, id, dto);
  }

  @Post('internal-orders/:id/release')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Release internal order' })
  releaseInternalOrder(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.controllingService.releaseInternalOrder(user.tenantId, id);
  }

  @Get('internal-orders/:id/actuals')
  @ApiOperation({ summary: 'Get actual costs posted to internal order' })
  getInternalOrderActuals(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.controllingService.getInternalOrderActuals(user.tenantId, id);
  }

  @Post('internal-orders/:id/settle')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Settle internal order — post costs to settlement cost center/account' })
  settleInternalOrder(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.controllingService.settleInternalOrder(user.tenantId, id, user.id);
  }

  // ─── CO-PA Report ────────────────────────────────────────────────────────

  @Get('copa-report')
  @ApiOperation({ summary: 'CO-PA profitability report grouped by profit center and account type' })
  copaReport(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.controllingService.copaReport(user.tenantId, from, to);
  }

  // ─── Activity Types (Phase 79) ───────────────────────────────────────────

  @Get('activity-types')
  @ApiOperation({ summary: 'List activity types' })
  listActivityTypes(@CurrentUser() user: any) {
    return this.controllingService.listActivityTypes(user.tenantId);
  }

  @Post('activity-types')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create activity type' })
  createActivityType(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.createActivityType(user.tenantId, dto);
  }

  @Patch('activity-types/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update activity type' })
  updateActivityType(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.controllingService.updateActivityType(user.tenantId, id, dto);
  }

  // ─── Activity Prices (Phase 79) ──────────────────────────────────────────

  @Get('activity-prices')
  @ApiOperation({ summary: 'List activity prices, optionally filtered by fiscalYear' })
  listActivityPrices(
    @CurrentUser() user: any,
    @Query('fiscalYear') fiscalYear?: string,
  ) {
    return this.controllingService.listActivityPrices(
      user.tenantId,
      fiscalYear ? parseInt(fiscalYear, 10) : undefined,
    );
  }

  @Post('activity-prices')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Upsert activity price (plannedCost / plannedQty → plannedRate)' })
  setActivityPrice(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.setActivityPrice(user.tenantId, dto);
  }

  @Post('activity-confirmations')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Confirm activity: post GL and update actual rate' })
  confirmActivity(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.confirmActivity(user.tenantId, dto);
  }

  // ─── Overhead Costing Sheets (Phase 79) ─────────────────────────────────

  @Get('overhead-sheets')
  @ApiOperation({ summary: 'List overhead costing sheets' })
  listOverheadCostingSheets(@CurrentUser() user: any) {
    return this.controllingService.listOverheadCostingSheets(user.tenantId);
  }

  @Post('overhead-sheets')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Create overhead costing sheet' })
  createOverheadCostingSheet(@CurrentUser() user: any, @Body() dto: any) {
    return this.controllingService.createOverheadCostingSheet(user.tenantId, dto);
  }

  @Patch('overhead-sheets/:id')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Update overhead costing sheet' })
  updateOverheadCostingSheet(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.controllingService.updateOverheadCostingSheet(user.tenantId, id, dto);
  }

  @Post('overhead-sheets/:id/apply')
  @RequirePermission('finance:gl:write')
  @ApiOperation({ summary: 'Apply overhead sheet to a production order' })
  applyOverheadToOrder(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: any,
  ) {
    return this.controllingService.applyOverheadToOrder(
      user.tenantId,
      id,
      dto,
      user.id,
    );
  }
}
