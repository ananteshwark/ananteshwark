import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RosterService } from './roster.service';

@ApiTags('roster')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/roster')
export class RosterController {
  constructor(private readonly service: RosterService) {}

  @Get('coverage')
  @RequirePermission('hr:attendance:read')
  @ApiOperation({ summary: 'Coverage demand vs assigned vs gap per shift/date' })
  coverage(@CurrentUser() user: any, @Query('from') from: string, @Query('to') to: string) {
    return this.service.coverage(user.tenantId, from, to);
  }

  @Post('demand')
  @RequirePermission('hr:attendance:approve')
  upsertDemand(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.upsertDemand(user.tenantId, dto);
  }

  @Get('entries')
  @RequirePermission('hr:attendance:read')
  entries(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.listEntries(user.tenantId, from, to, employeeId);
  }

  @Post('entries')
  @RequirePermission('hr:attendance:approve')
  assign(@CurrentUser() user: any, @Body() body: { demandId: string; employeeId: string }) {
    return this.service.assign(user.tenantId, body.demandId, body.employeeId);
  }

  @Delete('entries/:id')
  @RequirePermission('hr:attendance:approve')
  unassign(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.unassign(user.tenantId, id);
  }

  @Post('auto-assign')
  @RequirePermission('hr:attendance:approve')
  @ApiOperation({ summary: 'Greedy coverage fill respecting leave, double-booking, weekly caps' })
  autoAssign(@CurrentUser() user: any, @Body() dto: { from: string; to: string; maxShiftsPerWeek?: number; departmentId?: string }) {
    return this.service.autoAssign(user.tenantId, dto);
  }

  @Post('publish')
  @RequirePermission('hr:attendance:approve')
  publish(@CurrentUser() user: any, @Body() body: { from: string; to: string }) {
    return this.service.publish(user.tenantId, body.from, body.to);
  }
}
