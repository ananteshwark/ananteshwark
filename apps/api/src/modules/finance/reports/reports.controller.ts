import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('finance-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('trial-balance')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Get trial balance' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({ name: 'asOf', required: false })
  getTrialBalance(
    @CurrentUser() user: any,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('periodId') periodId?: string,
    @Query('asOf') asOf?: string,
    @Query('ledgerCode') ledgerCode?: string,
  ) {
    return this.reportsService.getTrialBalance(user.tenantId, { from, to, periodId, asOf, ledgerCode });
  }

  @Get('profit-loss')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Get profit and loss statement' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'periodId', required: false })
  getProfitAndLoss(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('periodId') periodId?: string,
    @Query('ledgerCode') ledgerCode?: string,
  ) {
    return this.reportsService.getProfitAndLoss(user.tenantId, { from, to, periodId, ledgerCode });
  }

  @Get('balance-sheet')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Get balance sheet' })
  @ApiQuery({ name: 'asOf', required: true })
  getBalanceSheet(
    @CurrentUser() user: any,
    @Query('asOf') asOf: string,
    @Query('ledgerCode') ledgerCode?: string,
  ) {
    return this.reportsService.getBalanceSheet(user.tenantId, { asOf, ledgerCode });
  }

  @Get('gl-detail')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Get GL detail for an account' })
  @ApiQuery({ name: 'accountId', required: true })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  @ApiQuery({ name: 'periodId', required: false })
  getGlDetail(
    @CurrentUser() user: any,
    @Query('accountId') accountId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.reportsService.getGlDetail(user.tenantId, { accountId, from, to, periodId });
  }

  @Get('cash-flow')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Get cash flow statement' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getCashFlow(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.reportsService.getCashFlow(user.tenantId, { from, to });
  }
}
