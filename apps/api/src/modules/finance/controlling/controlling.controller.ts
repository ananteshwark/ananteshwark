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
}
