import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WorkweekService } from './workweek.service';
import { InfractionType } from './entities/workweek.entity';

@ApiTags('time-workweek')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/attendance/workweek')
export class WorkweekController {
  constructor(private readonly service: WorkweekService) {}

  // ---- Break rules ----
  @Get('break-rules')
  @RequirePermission('hr:attendance:read')
  listBreakRules(@CurrentUser() user: any) {
    return this.service.listBreakRules(user.tenantId);
  }

  @Post('break-rules')
  @RequirePermission('hr:attendance:compliance')
  createBreakRule(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createBreakRule(user.tenantId, dto);
  }

  @Post('break-rules/evaluate')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Evaluate required vs taken break minutes for a worked shift' })
  evaluateBreaks(@CurrentUser() user: any, @Body() body: { workedMinutes: number; breakMinutesTaken: number }) {
    return this.service.evaluateBreaks(user.tenantId, body.workedMinutes, body.breakMinutesTaken ?? 0);
  }

  // ---- Infractions ----
  @Get('infractions')
  @RequirePermission('hr:attendance:read')
  listInfractions(@CurrentUser() user: any, @Query('employeeId') employeeId: string) {
    return this.service.listInfractions(user.tenantId, employeeId);
  }

  @Post('infractions')
  @RequirePermission('hr:attendance:compliance')
  recordInfraction(@CurrentUser() user: any, @Body() dto: { employeeId: string; date: string; type: InfractionType; points?: number; note?: string }) {
    return this.service.recordInfraction(user.tenantId, dto);
  }

  @Post('infractions/:id/waive')
  @RequirePermission('hr:attendance:compliance')
  waiveInfraction(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.waiveInfraction(user.tenantId, id);
  }

  @Get('infractions/:employeeId/points')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Active point total in a window with escalation flag' })
  points(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Query('from') from: string, @Query('to') to: string) {
    return this.service.pointsInWindow(user.tenantId, employeeId, from, to);
  }

  // ---- Fair workweek ----
  @Post('fair-workweek/rules')
  @RequirePermission('hr:attendance:compliance')
  createRule(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createFairWorkweekRule(user.tenantId, dto);
  }

  @Post('fair-workweek/check-clopening')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Check rest between shifts (clopening) and owed predictability pay' })
  checkClopening(@CurrentUser() user: any, @Body() body: { prevShiftEnd: string; nextShiftStart: string }) {
    return this.service.checkClopening(user.tenantId, body.prevShiftEnd, body.nextShiftStart);
  }

  @Post('fair-workweek/check-notice')
  @RequirePermission('hr:attendance:read')
  checkNotice(@CurrentUser() user: any, @Body() body: { postedDate: string; shiftStartDate: string }) {
    return this.service.checkAdvanceNotice(user.tenantId, body.postedDate, body.shiftStartDate);
  }

  // ---- One View ----
  @Post('one-view')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Unified daily scheduled-vs-actual view with exceptions' })
  oneView(@CurrentUser() user: any, @Body() body: { employeeId: string; date: string; day: any }) {
    return this.service.oneView(user.tenantId, body.employeeId, body.date, body.day ?? {});
  }
}
