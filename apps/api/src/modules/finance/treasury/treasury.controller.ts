import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TreasuryService } from './treasury.service';
import { CashForecastService } from './cash-forecast.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BankGuaranteeStatus } from './entities/bank-guarantee.entity';
import { InstrumentStatus } from './entities/financial-instrument.entity';

@ApiTags('finance-treasury')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/treasury')
export class TreasuryController {
  constructor(
    private readonly treasuryService: TreasuryService,
    private readonly cashForecastService: CashForecastService,
  ) {}

  // ─── Cash Position ────────────────────────────────────────────────
  @Get('cash-positions')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'List cash position snapshots' })
  getCashPositions(
    @CurrentUser() user: any,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.treasuryService.getCashPositions(user.tenantId, { bankAccountId, from, to });
  }

  @Get('cash-positions/summary')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'Get cash position summary grouped by currency for a date' })
  getCashPositionSummary(@CurrentUser() user: any, @Query('date') date: string) {
    return this.treasuryService.getCashPositionSummary(user.tenantId, date);
  }

  @Post('cash-positions')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Create a cash position snapshot' })
  createCashPosition(@CurrentUser() user: any, @Body() body: any) {
    return this.treasuryService.createCashPosition(user.tenantId, body);
  }

  // ─── Bank Guarantees ──────────────────────────────────────────────
  @Get('guarantees')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'List bank guarantees' })
  listGuarantees(@CurrentUser() user: any, @Query('status') status?: BankGuaranteeStatus) {
    return this.treasuryService.listGuarantees(user.tenantId, status);
  }

  @Get('guarantees/:id')
  @RequirePermission('finance.treasury.read')
  getGuarantee(@CurrentUser() user: any, @Param('id') id: string) {
    return this.treasuryService.getGuarantee(user.tenantId, id);
  }

  @Post('guarantees')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Create a bank guarantee' })
  createGuarantee(@CurrentUser() user: any, @Body() body: any) {
    return this.treasuryService.createGuarantee(user.tenantId, body);
  }

  @Patch('guarantees/:id/status')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Update guarantee status (claim/release/expire)' })
  updateGuaranteeStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.treasuryService.updateGuaranteeStatus(user.tenantId, id, body);
  }

  // ─── Financial Instruments ────────────────────────────────────────
  @Get('instruments')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'List money market instruments' })
  listInstruments(
    @CurrentUser() user: any,
    @Query('status') status?: InstrumentStatus,
    @Query('type') type?: string,
  ) {
    return this.treasuryService.listInstruments(user.tenantId, { status, type });
  }

  @Get('instruments/:id')
  @RequirePermission('finance.treasury.read')
  getInstrument(@CurrentUser() user: any, @Param('id') id: string) {
    return this.treasuryService.getInstrument(user.tenantId, id);
  }

  @Post('instruments')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Create a financial instrument' })
  createInstrument(@CurrentUser() user: any, @Body() body: any) {
    return this.treasuryService.createInstrument(user.tenantId, body);
  }

  @Post('instruments/:id/accrue')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Accrue interest for an instrument' })
  accrueInterest(@CurrentUser() user: any, @Param('id') id: string) {
    return this.treasuryService.accrueInterest(user.tenantId, id);
  }

  @Post('instruments/:id/redeem')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Redeem a financial instrument' })
  redeemInstrument(@CurrentUser() user: any, @Param('id') id: string) {
    return this.treasuryService.redeemInstrument(user.tenantId, id);
  }

  // ─── Liquidity Forecast ───────────────────────────────────────────
  @Get('liquidity-forecast')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'Get liquidity forecast (AP payables vs AR receivables per bucket)' })
  getLiquidityForecast(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('bucket') bucket: 'daily' | 'weekly' = 'daily',
  ) {
    return this.treasuryService.getLiquidityForecast(user.tenantId, from, to, bucket);
  }

  // ─── Sweep Rules ──────────────────────────────────────────────────
  @Get('sweep-rules')
  @RequirePermission('finance.treasury.read')
  listSweepRules(@CurrentUser() user: any) {
    return this.treasuryService.listSweepRules(user.tenantId);
  }

  @Post('sweep-rules')
  @RequirePermission('finance.treasury.write')
  @ApiOperation({ summary: 'Create a cash concentration sweep rule' })
  createSweepRule(@CurrentUser() user: any, @Body() body: any) {
    return this.treasuryService.createSweepRule(user.tenantId, body);
  }

  @Patch('sweep-rules/:id')
  @RequirePermission('finance.treasury.write')
  updateSweepRule(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.treasuryService.updateSweepRule(user.tenantId, id, body);
  }

  @Post('sweep-rules/:id/execute')
  @RequirePermission('finance.treasury.execute')
  @ApiOperation({ summary: 'Execute a cash concentration sweep' })
  executeSweep(@CurrentUser() user: any, @Param('id') id: string) {
    return this.treasuryService.executeSweep(user.tenantId, id, user.id);
  }

  @Get('sweep-logs')
  @RequirePermission('finance.treasury.read')
  getSweepLogs(@CurrentUser() user: any, @Query('ruleId') ruleId?: string) {
    return this.treasuryService.getSweepLogs(user.tenantId, ruleId);
  }

  // ─── Ph-128/129: Cash Forecasting ─────────────────────────────────
  @Get('cash-forecasts')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'List persisted cash forecasts' })
  listForecasts(@CurrentUser() user: any) {
    return this.cashForecastService.listForecasts(user.tenantId);
  }

  @Post('cash-forecasts')
  @RequirePermission('finance.treasury.manage')
  @ApiOperation({ summary: 'Generate a cash forecast (AR/AP/payroll/instrument maturities)' })
  generateForecast(@CurrentUser() user: any, @Body() body: any) {
    return this.cashForecastService.generateForecast(user.tenantId, body);
  }

  @Get('cash-forecasts/:id')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'Get a forecast with lines and running balance' })
  getForecast(@CurrentUser() user: any, @Param('id') id: string) {
    return this.cashForecastService.getForecast(user.tenantId, id);
  }

  @Get('cash-forecasts/:id/variance')
  @RequirePermission('finance.treasury.read')
  @ApiOperation({ summary: 'Forecast vs actual cash variance analysis' })
  variance(@CurrentUser() user: any, @Param('id') id: string) {
    return this.cashForecastService.varianceReport(user.tenantId, id);
  }
}
