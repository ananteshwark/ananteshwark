import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateReportDefinitionDto, RunReportDto, CreateScheduleDto, CreateBudgetDto, CreateKpiDto } from './dto/analytics.dto';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  // Reports
  @Get('reports')
  @RequirePermission('analytics:read')
  listReports(@CurrentUser() u: any, @Query() pagination: PaginationDto) {
    return this.svc.listReports(u.tenantId, pagination);
  }

  @Post('reports')
  @RequirePermission('analytics:manage')
  createReport(@CurrentUser() u: any, @Body() dto: CreateReportDefinitionDto) {
    return this.svc.createReport(u.tenantId, u.id, dto);
  }

  @Get('reports/:id')
  @RequirePermission('analytics:read')
  findReport(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.findReport(u.tenantId, id);
  }

  @Post('reports/:id/run')
  @RequirePermission('analytics:read')
  runReport(@CurrentUser() u: any, @Param('id') id: string, @Body() dto: RunReportDto) {
    return this.svc.runReport(u.tenantId, id, dto);
  }

  // Schedules
  @Get('schedules')
  @RequirePermission('analytics:read')
  listSchedules(@CurrentUser() u: any) {
    return this.svc.listSchedules(u.tenantId);
  }

  @Post('schedules')
  @RequirePermission('analytics:manage')
  createSchedule(@CurrentUser() u: any, @Body() dto: CreateScheduleDto) {
    return this.svc.createSchedule(u.tenantId, dto);
  }

  // Budgets
  @Get('budgets')
  @RequirePermission('analytics:read')
  listBudgets(@CurrentUser() u: any, @Query() pagination: PaginationDto) {
    return this.svc.listBudgets(u.tenantId, pagination);
  }

  @Post('budgets')
  @RequirePermission('analytics:manage')
  createBudget(@CurrentUser() u: any, @Body() dto: CreateBudgetDto) {
    return this.svc.createBudget(u.tenantId, dto);
  }

  @Post('budgets/:id/approve')
  @RequirePermission('analytics:manage')
  approveBudget(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.approveBudget(u.tenantId, id);
  }

  @Get('budgets/:id/variance')
  @RequirePermission('analytics:read')
  getBudgetVariance(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.getBudgetVariance(u.tenantId, id);
  }

  // KPIs
  @Get('kpis')
  @RequirePermission('analytics:read')
  listKpis(@CurrentUser() u: any) {
    return this.svc.listKpis(u.tenantId);
  }

  @Post('kpis')
  @RequirePermission('analytics:manage')
  createKpi(@CurrentUser() u: any, @Body() dto: CreateKpiDto) {
    return this.svc.createKpi(u.tenantId, dto);
  }

  @Get('kpis/dashboard')
  @RequirePermission('analytics:read')
  getDashboard(@CurrentUser() u: any) {
    return this.svc.getDashboardKpis(u.tenantId);
  }

  @Get('kpis/:id/evaluate')
  @RequirePermission('analytics:read')
  evaluateKpi(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.evaluateKpi(u.tenantId, id);
  }
}
