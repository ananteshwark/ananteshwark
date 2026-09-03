import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DisciplinaryService } from './disciplinary.service';
import { DisciplinaryStatus, DisciplinaryStage, CaseEventKind } from './entities/disciplinary.entity';

@ApiTags('hr-disciplinary')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/disciplinary')
export class DisciplinaryController {
  constructor(private readonly service: DisciplinaryService) {}

  @Get('cases')
  @RequirePermission('hr:disciplinary:read')
  listCases(@CurrentUser() user: any, @Query('employeeId') employeeId?: string, @Query('status') status?: DisciplinaryStatus) {
    return this.service.listCases(user.tenantId, { employeeId, status });
  }

  @Post('cases')
  @RequirePermission('hr:disciplinary:manage')
  openCase(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.openCase(user.tenantId, { ...dto, raisedByUserId: user.id });
  }

  @Get('cases/:id')
  @RequirePermission('hr:disciplinary:read')
  getCase(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCase(user.tenantId, id);
  }

  @Post('cases/:id/events')
  @RequirePermission('hr:disciplinary:manage')
  addEvent(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { kind?: CaseEventKind; detail: string }) {
    return this.service.addEvent(user.tenantId, id, { ...dto, byUserId: user.id });
  }

  @Post('cases/:id/status')
  @RequirePermission('hr:disciplinary:manage')
  transitionStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: DisciplinaryStatus }) {
    return this.service.transitionStatus(user.tenantId, id, body.status, user.id);
  }

  @Post('cases/:id/actions')
  @RequirePermission('hr:disciplinary:manage')
  @ApiOperation({ summary: 'Issue a progressive-discipline action (one stage forward; gross may jump)' })
  issueAction(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { actionStage: DisciplinaryStage; note?: string; expiresAt?: string }) {
    return this.service.issueAction(user.tenantId, id, { ...dto, issuedByUserId: user.id });
  }

  @Post('actions/:actionId/acknowledge')
  @RequirePermission('hr:disciplinary:read')
  acknowledgeAction(@CurrentUser() user: any, @Param('actionId') actionId: string) {
    return this.service.acknowledgeAction(user.tenantId, actionId);
  }

  @Post('cases/:id/close')
  @RequirePermission('hr:disciplinary:manage')
  closeCase(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { outcome?: string }) {
    return this.service.closeCase(user.tenantId, id, { ...body, byUserId: user.id });
  }

  @Get('employees/:employeeId/active-warnings')
  @RequirePermission('hr:disciplinary:read')
  @ApiOperation({ summary: 'An employee\'s non-expired warnings (progressive-discipline history)' })
  activeWarnings(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Query('asOf') asOf: string) {
    return this.service.activeWarnings(user.tenantId, employeeId, asOf);
  }
}
