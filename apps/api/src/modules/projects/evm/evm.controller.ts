import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { EvmService } from './evm.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('project-evm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('projects/evm')
export class EvmController {
  constructor(private readonly service: EvmService) {}

  // ─── Ph-245: baseline ─────────────────────────────────────────────
  @Post(':projectId/baseline')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Establish an EVM baseline (PMB)' })
  createBaseline(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: { lines: any[]; notes?: string }) {
    return this.service.createBaseline(u.tenantId, projectId, b.lines, b.notes);
  }

  @Get(':projectId/baseline/lines')
  @RequirePermission('projects:read')
  baselineLines(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.getBaselineLines(u.tenantId, projectId); }

  // ─── Ph-246: measurements ─────────────────────────────────────────
  @Post(':projectId/measurements')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Record a task EVM measurement for a period' })
  measure(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.recordMeasurement(u.tenantId, { ...b, projectId });
  }

  @Get(':projectId/measurements')
  @RequirePermission('projects:read')
  @ApiQuery({ name: 'period', required: true })
  taskMeasurements(@CurrentUser() u: any, @Param('projectId') projectId: string, @Query('period') period: string) {
    return this.service.taskMeasurements(u.tenantId, projectId, period);
  }

  @Get(':projectId/metrics')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Project EVM metrics (SPI/CPI/EAC/VAC) for a period' })
  @ApiQuery({ name: 'period', required: true })
  metrics(@CurrentUser() u: any, @Param('projectId') projectId: string, @Query('period') period: string) {
    return this.service.projectMetrics(u.tenantId, projectId, period);
  }

  // ─── Ph-247: S-curve ──────────────────────────────────────────────
  @Get(':projectId/s-curve')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Cumulative PV/EV/AC S-curve with forecast-at-completion' })
  sCurve(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.sCurve(u.tenantId, projectId); }
}
