import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IncentiveService } from './incentive.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { IcTransactionStatus } from './entities/ic-transaction.entity';

@ApiTags('sales-incentive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/incentive')
export class IncentiveController {
  constructor(private readonly service: IncentiveService) {}

  // ─── Ph-225: plans ────────────────────────────────────────────────
  @Get('plans')
  @RequirePermission('sales:read')
  listPlans(@CurrentUser() u: any) { return this.service.listPlans(u.tenantId); }

  @Post('plans')
  @RequirePermission('sales:manage')
  createPlan(@CurrentUser() u: any, @Body() b: any) { return this.service.createPlan(u.tenantId, b); }

  // ─── Ph-226: calculation ──────────────────────────────────────────
  @Post('calculate')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Calculate a commission transaction' })
  calculate(@CurrentUser() u: any, @Body() b: any) { return this.service.calculate(u.tenantId, b); }

  @Get('transactions')
  @RequirePermission('sales:read')
  @ApiQuery({ name: 'repId', required: false })
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'status', required: false })
  listTransactions(@CurrentUser() u: any, @Query('repId') repId?: string, @Query('period') period?: string, @Query('status') status?: IcTransactionStatus) {
    return this.service.listTransactions(u.tenantId, { repId, period, status });
  }

  @Post('transactions/:id/approve')
  @RequirePermission('sales:manage')
  approve(@CurrentUser() u: any, @Param('id') id: string) { return this.service.approveTransaction(u.tenantId, id); }

  // ─── Ph-227: disputes ─────────────────────────────────────────────
  @Post('disputes')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Rep raises a dispute on a commission' })
  raiseDispute(@CurrentUser() u: any, @Body() b: any) { return this.service.raiseDispute(u.tenantId, b); }

  @Post('disputes/:id/resolve')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Manager resolves a dispute with optional adjustment' })
  resolveDispute(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.resolveDispute(u.tenantId, id, u.id, b); }

  // ─── Ph-228: payroll export ───────────────────────────────────────
  @Post('payroll-export')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Export approved commissions as payroll elements' })
  exportToPayroll(@CurrentUser() u: any, @Body() b: { period: string }) { return this.service.exportToPayroll(u.tenantId, b.period); }
}
