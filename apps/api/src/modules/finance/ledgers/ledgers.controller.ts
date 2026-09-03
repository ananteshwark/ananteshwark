import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LedgersService } from './ledgers.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('finance-ledgers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/ledgers')
export class LedgersController {
  constructor(private readonly service: LedgersService) {}

  // ─── Ledgers ──────────────────────────────────────────────────────────────

  @Get()
  @RequirePermission('finance:reports:read')
  listLedgers(@CurrentUser() user: any) {
    return this.service.listLedgers(user.tenantId);
  }

  @Post()
  @RequirePermission('finance:gl:manage')
  createLedger(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createLedger(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('finance:gl:manage')
  updateLedger(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateLedger(user.tenantId, id, dto);
  }

  @Post('seed-defaults')
  @RequirePermission('finance:gl:manage')
  @ApiOperation({ summary: 'Seed standard MAIN + IFRS + TAX ledgers' })
  seedDefaults(@CurrentUser() user: any) {
    return this.service.seedDefaultLedgers(user.tenantId);
  }

  // ─── Ledger groups ──────────────────────────────────────────────────────────

  @Get('groups')
  @RequirePermission('finance:reports:read')
  listGroups(@CurrentUser() user: any) {
    return this.service.listGroups(user.tenantId);
  }

  @Get('groups/:code')
  @RequirePermission('finance:reports:read')
  getGroup(@CurrentUser() user: any, @Param('code') code: string) {
    return this.service.getGroup(user.tenantId, code);
  }

  @Post('groups')
  @RequirePermission('finance:gl:manage')
  createGroup(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createGroup(user.tenantId, dto);
  }

  @Patch('groups/:id')
  @RequirePermission('finance:gl:manage')
  updateGroup(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateGroup(user.tenantId, id, dto);
  }

  // ─── Posting rules ────────────────────────────────────────────────────────────

  @Get('posting-rules')
  @RequirePermission('finance:reports:read')
  listPostingRules(@CurrentUser() user: any) {
    return this.service.listPostingRules(user.tenantId);
  }

  @Post('posting-rules')
  @RequirePermission('finance:gl:manage')
  upsertPostingRule(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.upsertPostingRule(user.tenantId, dto);
  }

  @Get('posting-rules/resolve/:source')
  @RequirePermission('finance:reports:read')
  resolveLedgers(@CurrentUser() user: any, @Param('source') source: JournalSource) {
    return this.service
      .resolveLedgersForSource(user.tenantId, source)
      .then((ledgerCodes) => ({ source, ledgerCodes }));
  }

  // ─── Ledger-filtered reports ──────────────────────────────────────────────────

  @Get(':ledgerCode/trial-balance')
  @RequirePermission('finance:reports:read')
  trialBalance(
    @CurrentUser() user: any,
    @Param('ledgerCode') ledgerCode: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('periodId') periodId?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.getTrialBalance(user.tenantId, ledgerCode, { from, to, periodId, asOf });
  }

  @Get(':ledgerCode/profit-loss')
  @RequirePermission('finance:reports:read')
  profitLoss(
    @CurrentUser() user: any,
    @Param('ledgerCode') ledgerCode: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('periodId') periodId?: string,
  ) {
    return this.service.getProfitAndLoss(user.tenantId, ledgerCode, { from, to, periodId });
  }

  @Get(':ledgerCode/balance-sheet')
  @RequirePermission('finance:reports:read')
  balanceSheet(
    @CurrentUser() user: any,
    @Param('ledgerCode') ledgerCode: string,
    @Query('asOf') asOf: string,
  ) {
    return this.service.getBalanceSheet(user.tenantId, ledgerCode, { asOf });
  }

  // ─── Reconciliation + close cockpit ────────────────────────────────────────────

  @Get('groups/:code/reconciliation')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Cross-ledger reconciliation matrix for a ledger group' })
  reconciliation(
    @CurrentUser() user: any,
    @Param('code') code: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('periodId') periodId?: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.getReconciliationMatrix(user.tenantId, code, { from, to, periodId, asOf });
  }

  @Get('groups/:code/close-cockpit/:periodId')
  @RequirePermission('finance:reports:read')
  @ApiOperation({ summary: 'Per-ledger period-close checklist for a ledger group' })
  closeCockpit(
    @CurrentUser() user: any,
    @Param('code') code: string,
    @Param('periodId') periodId: string,
  ) {
    return this.service.getGroupCloseCockpit(user.tenantId, code, periodId);
  }
}
