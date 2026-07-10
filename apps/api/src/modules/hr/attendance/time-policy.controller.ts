import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TimePolicyService } from './time-policy.service';

@ApiTags('hr-attendance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/time-policy')
export class TimePolicyController {
  constructor(private readonly service: TimePolicyService) {}

  // ---- Shift patterns ----
  @Get('patterns')
  @RequirePermission('hr:attendance:read')
  listPatterns(@CurrentUser() user: any) {
    return this.service.listPatterns(user.tenantId);
  }

  @Post('patterns')
  @RequirePermission('hr:attendance:create')
  @ApiOperation({ summary: 'Create a weekly shift pattern (7 slots, Monday-first)' })
  createPattern(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPattern(user.tenantId, dto);
  }

  @Post('patterns/:id/generate')
  @RequirePermission('hr:attendance:create')
  @ApiOperation({ summary: 'Generate per-day shift assignments from a pattern' })
  generate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { employeeIds: string[]; from: string; to: string }) {
    return this.service.generateAssignments(user.tenantId, id, dto);
  }

  // ---- Geofences ----
  @Get('geofences')
  @RequirePermission('hr:attendance:read')
  listGeofences(@CurrentUser() user: any) {
    return this.service.listGeofences(user.tenantId);
  }

  @Post('geofences')
  @RequirePermission('hr:attendance:create')
  createGeofence(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createGeofence(user.tenantId, dto);
  }

  @Post('geofences/validate')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Check whether a check-in location/IP is allowed' })
  validate(@CurrentUser() user: any, @Body() body: { lat?: number; lng?: number; ip?: string }) {
    return this.service.validateCheckin(user.tenantId, body);
  }

  // ---- Absconding sweep ----
  @Get('absconding')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Employees with consecutive-absent streaks (default threshold 3)' })
  absconding(
    @CurrentUser() user: any,
    @Query('asOf') asOf?: string,
    @Query('threshold') threshold?: string,
    @Query('lookbackDays') lookbackDays?: string,
  ) {
    return this.service.abscondingSweep(user.tenantId, {
      asOf,
      threshold: threshold ? parseInt(threshold) : undefined,
      lookbackDays: lookbackDays ? parseInt(lookbackDays) : undefined,
    });
  }
}
