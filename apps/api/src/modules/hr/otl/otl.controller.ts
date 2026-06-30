import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OtlService } from './otl.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('hr-otl')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/otl')
export class OtlController {
  constructor(private readonly service: OtlService) {}

  // ─── Ph-194: rules ────────────────────────────────────────────────
  @Get('rules')
  @RequirePermission('hr:read')
  listRules(@CurrentUser() u: any) { return this.service.listRules(u.tenantId); }

  @Post('rules')
  @RequirePermission('hr:manage')
  createRule(@CurrentUser() u: any, @Body() b: any) { return this.service.createRule(u.tenantId, b); }

  @Post('rules/seed-defaults')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Seed default OTL rules (daily/weekly OT, 7th day, differentials)' })
  seedDefaults(@CurrentUser() u: any) { return this.service.seedDefaults(u.tenantId); }

  // ─── Ph-194/195: processing ───────────────────────────────────────
  @Post('process')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Process a weekly timecard into payroll-ready elements' })
  process(@CurrentUser() u: any, @Body() b: { employeeId: string; periodStart: string; days: any[] }) {
    return this.service.processTimecard(u.tenantId, b.employeeId, b.periodStart, b.days);
  }

  @Get('result')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'employeeId', required: true })
  @ApiQuery({ name: 'periodStart', required: true })
  getResult(@CurrentUser() u: any, @Query('employeeId') employeeId: string, @Query('periodStart') periodStart: string) {
    return this.service.getResult(u.tenantId, employeeId, periodStart);
  }

  // ─── Ph-196: absence integration ──────────────────────────────────
  @Post('reconcile-absence')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Reconcile worked vs scheduled hours against approved leave' })
  reconcileAbsence(@CurrentUser() _u: any, @Body() b: any) { return this.service.reconcileAbsence(b); }

  // ─── Ph-197: payroll-ready export ─────────────────────────────────
  @Get('payroll-export')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Aggregate processed timecards by pay element' })
  @ApiQuery({ name: 'periodStart', required: true })
  @ApiQuery({ name: 'periodEnd', required: true })
  payrollExport(@CurrentUser() u: any, @Query('periodStart') periodStart: string, @Query('periodEnd') periodEnd: string) {
    return this.service.payrollExport(u.tenantId, periodStart, periodEnd);
  }
}
