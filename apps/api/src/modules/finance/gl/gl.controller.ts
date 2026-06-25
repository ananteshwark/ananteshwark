import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GlService } from './gl.service';
import { SlaService } from './sla.service';
import { SlaEventClass, SlaLineType } from './entities/sla-rule.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { CreateCostCenterDto, UpdateCostCenterDto } from './dto/cost-center.dto';
import {
  CreateFiscalYearDto,
  UpdateFiscalYearDto,
  CreatePeriodDto,
  UpdatePeriodDto,
} from './dto/fiscal-year.dto';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  JournalEntryFilterDto,
} from './dto/journal-entry.dto';
import { AccountType } from './entities/account.entity';

@ApiTags('finance-gl')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance')
export class GlController {
  constructor(
    private readonly glService: GlService,
    private readonly slaService: SlaService,
  ) {}

  // -------- Accounts --------
  @Get('accounts')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'List chart of accounts (paginated)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false, enum: AccountType })
  @ApiQuery({ name: 'isActive', required: false })
  listAccounts(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
    @Query('type') type?: AccountType,
    @Query('isActive') isActive?: string,
  ) {
    return this.glService.findAccounts(user.tenantId, pagination, {
      search,
      type,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }

  @Get('accounts/tree')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'Get chart of accounts as a hierarchy tree' })
  accountTree(@CurrentUser() user: any) {
    return this.glService.getAccountTree(user.tenantId);
  }

  @Get('accounts/:id')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'Get account by ID' })
  getAccount(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.findAccount(user.tenantId, id);
  }

  @Get('accounts/:id/balance')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'Get account balance (optionally as of date)' })
  @ApiQuery({ name: 'asOf', required: false })
  async accountBalance(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('asOf') asOf?: string,
  ) {
    const balance = await this.glService.getAccountBalance(user.tenantId, id, asOf);
    return { accountId: id, asOf: asOf || null, balance };
  }

  @Post('accounts')
  @RequirePermission('finance:accounts:create')
  @ApiOperation({ summary: 'Create an account' })
  createAccount(@CurrentUser() user: any, @Body() dto: CreateAccountDto) {
    return this.glService.createAccount(user.tenantId, dto);
  }

  @Patch('accounts/:id')
  @RequirePermission('finance:accounts:update')
  @ApiOperation({ summary: 'Update an account' })
  updateAccount(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.glService.updateAccount(user.tenantId, id, dto);
  }

  // -------- Cost Centers --------
  @Get('cost-centers')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'List cost centers (paginated)' })
  listCostCenters(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.glService.findCostCenters(user.tenantId, pagination);
  }

  @Get('cost-centers/:id')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'Get cost center by ID' })
  getCostCenter(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.findCostCenter(user.tenantId, id);
  }

  @Post('cost-centers')
  @RequirePermission('finance:accounts:create')
  @ApiOperation({ summary: 'Create a cost center' })
  createCostCenter(@CurrentUser() user: any, @Body() dto: CreateCostCenterDto) {
    return this.glService.createCostCenter(user.tenantId, dto);
  }

  @Patch('cost-centers/:id')
  @RequirePermission('finance:accounts:update')
  @ApiOperation({ summary: 'Update a cost center' })
  updateCostCenter(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCostCenterDto,
  ) {
    return this.glService.updateCostCenter(user.tenantId, id, dto);
  }

  // -------- Fiscal Years --------
  @Get('fiscal-years')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'List fiscal years' })
  listFiscalYears(@CurrentUser() user: any) {
    return this.glService.findFiscalYears(user.tenantId);
  }

  @Post('fiscal-years')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Create a fiscal year (optionally auto-generate periods)' })
  createFiscalYear(@CurrentUser() user: any, @Body() dto: CreateFiscalYearDto) {
    return this.glService.createFiscalYear(user.tenantId, dto);
  }

  @Patch('fiscal-years/:id')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Update a fiscal year' })
  updateFiscalYear(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateFiscalYearDto,
  ) {
    return this.glService.updateFiscalYear(user.tenantId, id, dto);
  }

  // -------- Periods --------
  @Get('periods')
  @RequirePermission('finance:accounts:read')
  @ApiOperation({ summary: 'List accounting periods (paginated)' })
  @ApiQuery({ name: 'fiscalYearId', required: false })
  listPeriods(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.glService.findPeriods(user.tenantId, pagination, fiscalYearId);
  }

  @Post('periods')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Create an accounting period' })
  createPeriod(@CurrentUser() user: any, @Body() dto: CreatePeriodDto) {
    return this.glService.createPeriod(user.tenantId, dto);
  }

  @Patch('periods/:id')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Update an accounting period' })
  updatePeriod(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePeriodDto,
  ) {
    return this.glService.updatePeriod(user.tenantId, id, dto);
  }

  @Post('periods/:id/close')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Close an accounting period' })
  closePeriod(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.closePeriod(user.tenantId, id);
  }

  @Post('periods/:id/reopen')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Reopen an accounting period' })
  reopenPeriod(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.reopenPeriod(user.tenantId, id);
  }

  // -------- Journal Entries --------
  @Get('journal-entries')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'List journal entries (paginated, filterable)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  listJournalEntries(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query() filters: JournalEntryFilterDto,
  ) {
    return this.glService.findJournalEntries(user.tenantId, pagination, filters);
  }

  @Get('journal-entries/:id')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'Get journal entry with lines' })
  getJournalEntry(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.findJournalEntry(user.tenantId, id);
  }

  @Post('journal-entries')
  @RequirePermission('finance:journal:create')
  @ApiOperation({ summary: 'Create a draft journal entry' })
  createJournalEntry(@CurrentUser() user: any, @Body() dto: CreateJournalEntryDto) {
    return this.glService.createJournalEntry(user.tenantId, dto);
  }

  @Patch('journal-entries/:id')
  @RequirePermission('finance:journal:create')
  @ApiOperation({ summary: 'Update a draft journal entry' })
  updateJournalEntry(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.glService.updateJournalEntry(user.tenantId, id, dto);
  }

  @Delete('journal-entries/:id')
  @RequirePermission('finance:journal:create')
  @ApiOperation({ summary: 'Delete a draft journal entry' })
  deleteJournalEntry(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.deleteJournalEntry(user.tenantId, id);
  }

  @Post('journal-entries/:id/post')
  @RequirePermission('finance:journal:post')
  @ApiOperation({ summary: 'Post a draft journal entry (enforces balance + period)' })
  postJournalEntry(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.postJournalEntryById(user.tenantId, id, user.id);
  }

  @Post('journal-entries/:id/reverse')
  @RequirePermission('finance:journal:reverse')
  @ApiOperation({ summary: 'Reverse a posted journal entry' })
  reverseJournalEntry(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { reversalDate?: string },
  ) {
    return this.glService.reverseJournalEntry(
      user.tenantId,
      id,
      user.id,
      body?.reversalDate,
    );
  }

  // ─── Phase 72: Document Splitting ────────────────────────────────
  @Get('splitting-rules')
  @RequirePermission('finance:journal:read')
  listSplittingRules(@CurrentUser() user: any) {
    return this.glService.listSplittingRules(user.tenantId);
  }

  @Post('splitting-rules')
  @RequirePermission('finance:journal:manage')
  createSplittingRule(@CurrentUser() user: any, @Body() body: any) {
    return this.glService.createSplittingRule(user.tenantId, body);
  }

  @Patch('splitting-rules/:id')
  @RequirePermission('finance:journal:manage')
  updateSplittingRule(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.glService.updateSplittingRule(user.tenantId, id, body);
  }

  @Post('journal-entries/:id/apply-splitting')
  @RequirePermission('finance:journal:manage')
  applySplitting(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.applySplitting(user.tenantId, id);
  }

  @Get('segment-trial-balance')
  @RequirePermission('finance:reports:read')
  segmentTrialBalance(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('ledgerCode') ledgerCode?: string,
  ) {
    return this.glService.segmentTrialBalance(user.tenantId, from, to, ledgerCode);
  }

  // ─── Phase 76: Recurring Journals ────────────────────────────────
  @Get('recurring-journals')
  @RequirePermission('finance:journal:read')
  listRecurringJournals(@CurrentUser() user: any) {
    return this.glService.listRecurringJournals(user.tenantId);
  }

  @Post('recurring-journals')
  @RequirePermission('finance:journal:manage')
  createRecurringJournal(@CurrentUser() user: any, @Body() body: any) {
    return this.glService.createRecurringJournal(user.tenantId, body);
  }

  @Patch('recurring-journals/:id')
  @RequirePermission('finance:journal:manage')
  updateRecurringJournal(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.glService.updateRecurringJournal(user.tenantId, id, body);
  }

  @Post('recurring-journals/run')
  @RequirePermission('finance:journal:post')
  runRecurringJournals(
    @CurrentUser() user: any,
    @Body() body: { asOfDate?: string },
  ) {
    return this.glService.runRecurringJournals(user.tenantId, body?.asOfDate, user.id);
  }

  // ─── Phase 76: Accrual Engine ─────────────────────────────────────
  @Get('accrual-configs')
  @RequirePermission('finance:journal:read')
  listAccrualConfigs(@CurrentUser() user: any) {
    return this.glService.listAccrualConfigs(user.tenantId);
  }

  @Post('accrual-configs')
  @RequirePermission('finance:journal:manage')
  createAccrualConfig(@CurrentUser() user: any, @Body() body: any) {
    return this.glService.createAccrualConfig(user.tenantId, body);
  }

  @Patch('accrual-configs/:id')
  @RequirePermission('finance:journal:manage')
  updateAccrualConfig(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.glService.updateAccrualConfig(user.tenantId, id, body);
  }

  @Post('accrual-configs/:id/post')
  @RequirePermission('finance:journal:post')
  postAccrual(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { period: string },
  ) {
    return this.glService.postAccrual(user.tenantId, id, body.period, user.id);
  }

  // ─── Phase 76: Period-Close Cockpit ───────────────────────────────
  @Get('periods/:id/close-cockpit')
  @RequirePermission('finance:periods:manage')
  getPeriodCloseCockpit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.glService.getPeriodCloseCockpit(user.tenantId, id);
  }

  // ─── Phase 93–95: Subledger Accounting Engine (SLA) ───────────────

  @Get('sla/rules')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'List SLA account derivation rules' })
  listSlaRules(
    @CurrentUser() user: any,
    @Query('eventClass') eventClass?: SlaEventClass,
  ) {
    return this.slaService.listRules(user.tenantId, eventClass);
  }

  @Get('sla/rules/:id')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'Get a single SLA rule' })
  getSlaRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.slaService.getRule(user.tenantId, id);
  }

  @Post('sla/rules')
  @RequirePermission('finance:journal:post')
  @ApiOperation({ summary: 'Create an SLA account derivation rule' })
  createSlaRule(@CurrentUser() user: any, @Body() body: any) {
    return this.slaService.createRule(user.tenantId, body);
  }

  @Patch('sla/rules/:id')
  @RequirePermission('finance:journal:post')
  @ApiOperation({ summary: 'Update an SLA rule' })
  updateSlaRule(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.slaService.updateRule(user.tenantId, id, body);
  }

  @Delete('sla/rules/:id')
  @RequirePermission('finance:journal:post')
  @ApiOperation({ summary: 'Delete an SLA rule' })
  deleteSlaRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.slaService.deleteRule(user.tenantId, id);
  }

  @Post('sla/derive-account')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'Test-derive an account from an event context (dry-run)' })
  deriveAccount(
    @CurrentUser() user: any,
    @Body() body: { eventClass: SlaEventClass; lineType: SlaLineType; eventContext: Record<string, any> },
  ) {
    return this.slaService.deriveAccount(user.tenantId, body.eventClass, body.lineType, body.eventContext);
  }

  @Get('sla/audit-trail')
  @RequirePermission('finance:journal:read')
  @ApiOperation({ summary: 'XLA accounting event audit trail' })
  getSlaAuditTrail(
    @CurrentUser() user: any,
    @Query('sourceDocumentId') sourceDocumentId?: string,
    @Query('journalEntryId') journalEntryId?: string,
    @Query('eventClass') eventClass?: SlaEventClass,
    @Query('limit') limit?: string,
  ) {
    return this.slaService.getAuditTrail(user.tenantId, {
      sourceDocumentId,
      journalEntryId,
      eventClass,
      limit: limit ? Number(limit) : 200,
    });
  }
}
