import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ExpenseEcosystemService, ExpenseCandidate } from './expense-ecosystem.service';
import { CardTxnStatus } from './entities/ecosystem.entity';

@ApiTags('expense-ecosystem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('expenses/ecosystem')
export class ExpenseEcosystemController {
  constructor(private readonly service: ExpenseEcosystemService) {}

  // ---- Card feeds ----
  @Get('feeds')
  @RequirePermission('expenses:ecosystem:read')
  listFeeds(@CurrentUser() user: any) {
    return this.service.listFeeds(user.tenantId);
  }

  @Post('feeds')
  @RequirePermission('expenses:ecosystem:manage')
  registerFeed(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.registerFeed(user.tenantId, dto);
  }

  @Get('transactions')
  @RequirePermission('expenses:ecosystem:read')
  listTransactions(@CurrentUser() user: any, @Query('feedId') feedId?: string, @Query('status') status?: CardTxnStatus) {
    return this.service.listTransactions(user.tenantId, { feedId, status });
  }

  @Post('feeds/:feedId/transactions')
  @RequirePermission('expenses:ecosystem:ingest')
  @ApiOperation({ summary: 'Ingest a card transaction (idempotent by external ref)' })
  ingestTransaction(@CurrentUser() user: any, @Param('feedId') feedId: string, @Body() dto: any) {
    return this.service.ingestTransaction(user.tenantId, feedId, dto);
  }

  @Post('transactions/:id/match')
  @RequirePermission('expenses:ecosystem:manage')
  match(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { expenseId: string }) {
    return this.service.matchTransaction(user.tenantId, id, body.expenseId);
  }

  @Post('transactions/:id/reconcile')
  @RequirePermission('expenses:ecosystem:manage')
  reconcile(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reconcile(user.tenantId, id);
  }

  @Post('feeds/:feedId/auto-match')
  @RequirePermission('expenses:ecosystem:manage')
  @ApiOperation({ summary: 'Auto-match a feed\'s unmatched transactions to candidate expenses' })
  autoMatch(@CurrentUser() user: any, @Param('feedId') feedId: string, @Body() body: { candidates: ExpenseCandidate[]; amountTolerance?: number; dateWindowDays?: number }) {
    return this.service.runAutoMatch(user.tenantId, feedId, body?.candidates ?? [], { amountTolerance: body?.amountTolerance, dateWindowDays: body?.dateWindowDays });
  }

  // ---- Trips ----
  @Get('trips')
  @RequirePermission('expenses:ecosystem:read')
  listTrips(@CurrentUser() user: any, @Query('employeeId') employeeId?: string) {
    return this.service.listTrips(user.tenantId, employeeId);
  }

  @Post('trips')
  @RequirePermission('expenses:ecosystem:ingest')
  @ApiOperation({ summary: 'Import a trip/ride from a TMS or cab provider (idempotent)' })
  ingestTrip(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.ingestTrip(user.tenantId, dto);
  }

  @Post('trips/:id/link')
  @RequirePermission('expenses:ecosystem:manage')
  linkTrip(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { travelRequestId: string }) {
    return this.service.linkTrip(user.tenantId, id, body.travelRequestId);
  }
}
