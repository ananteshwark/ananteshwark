import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BiService } from './bi.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('analytics-bi')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/bi')
export class BiController {
  constructor(private readonly service: BiService) {}

  // ─── Ph-251: subject areas ────────────────────────────────────────
  @Get('subject-areas')
  @RequirePermission('analytics:read')
  listSubjectAreas(@CurrentUser() u: any) { return this.service.listSubjectAreas(u.tenantId); }

  @Post('subject-areas')
  @RequirePermission('analytics:manage')
  createSubjectArea(@CurrentUser() u: any, @Body() b: any) { return this.service.createSubjectArea(u.tenantId, b); }

  @Post('subject-areas/seed')
  @RequirePermission('analytics:manage')
  @ApiOperation({ summary: 'Seed default subject areas (Finance/HCM/SCM/CRM)' })
  seed(@CurrentUser() u: any) { return this.service.seedDefaults(u.tenantId); }

  // ─── Ph-252: report builder ───────────────────────────────────────
  @Get('reports')
  @RequirePermission('analytics:read')
  listReports(@CurrentUser() u: any) { return this.service.listReports(u.tenantId, u.id); }

  @Post('reports')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Save a report definition' })
  createReport(@CurrentUser() u: any, @Body() b: any) { return this.service.createReport(u.tenantId, u.id, b); }

  @Post('reports/preview')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Execute a report definition against provided rows' })
  preview(@CurrentUser() _u: any, @Body() b: { definition: any; rows: any[] }) { return this.service.executeDefinition(b.definition, b.rows ?? []); }

  @Post('reports/:id/run')
  @RequirePermission('analytics:read')
  run(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { rows: any[] }) { return this.service.runReport(u.tenantId, id, b.rows ?? []); }

  // ─── Ph-253: schedules ────────────────────────────────────────────
  @Get('schedules')
  @RequirePermission('analytics:read')
  listSchedules(@CurrentUser() u: any) { return this.service.listSchedules(u.tenantId); }

  @Post('schedules')
  @RequirePermission('analytics:manage')
  @ApiOperation({ summary: 'Schedule email delivery of a saved report' })
  createSchedule(@CurrentUser() u: any, @Body() b: any) { return this.service.createSchedule(u.tenantId, b); }

  @Post('schedules/:id/mark-run')
  @RequirePermission('analytics:manage')
  markRun(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { at: string }) { return this.service.markScheduleRun(u.tenantId, id, b.at); }

  // ─── Ph-254: KPI tiles ────────────────────────────────────────────
  @Get('tiles')
  @RequirePermission('analytics:read')
  @ApiQuery({ name: 'dashboardId', required: false })
  listTiles(@CurrentUser() u: any, @Query('dashboardId') dashboardId?: string) { return this.service.listTiles(u.tenantId, dashboardId ?? 'home'); }

  @Post('tiles')
  @RequirePermission('analytics:manage')
  createTile(@CurrentUser() u: any, @Body() b: any) { return this.service.createTile(u.tenantId, b); }

  @Post('tiles/:id/compute')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Compute a KPI tile value vs its target' })
  computeTile(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { rows: any[] }) { return this.service.computeTile(u.tenantId, id, b.rows ?? []); }
}
