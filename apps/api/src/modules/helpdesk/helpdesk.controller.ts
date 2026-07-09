import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { HelpdeskService } from './helpdesk.service';
import { HrCaseStatus, HrCaseCategory } from './entities/hr-case.entity';

const displayName = (user: any) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

@ApiTags('helpdesk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('helpdesk')
export class HelpdeskController {
  constructor(private readonly service: HelpdeskService) {}

  // Self-service: raise and track my own cases.
  @Post('cases')
  @RequirePermission('hr:helpdesk:read')
  createCase(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCase(user.tenantId, user.id, dto);
  }

  @Get('cases/mine')
  @RequirePermission('hr:helpdesk:read')
  myCases(@CurrentUser() user: any) {
    return this.service.myCases(user.tenantId, user.id);
  }

  // HR team: full queue.
  @Get('cases')
  @RequirePermission('hr:helpdesk:manage')
  listCases(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: HrCaseStatus,
    @Query('category') category?: HrCaseCategory,
    @Query('assignedToId') assignedToId?: string,
  ) {
    return this.service.listCases(user.tenantId, pagination, { status, category, assignedToId });
  }

  @Get('cases/:id')
  @RequirePermission('hr:helpdesk:read')
  getCase(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCase(user.tenantId, id);
  }

  @Patch('cases/:id/assign')
  @RequirePermission('hr:helpdesk:manage')
  assign(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { assignedToId: string }) {
    return this.service.assign(user.tenantId, id, body.assignedToId);
  }

  @Patch('cases/:id/status')
  @RequirePermission('hr:helpdesk:manage')
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status: HrCaseStatus; resolutionNotes?: string },
  ) {
    return this.service.updateStatus(user.tenantId, id, body.status, body.resolutionNotes);
  }

  @Post('cases/:id/comments')
  @RequirePermission('hr:helpdesk:read')
  addComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { body: string; internal?: boolean },
  ) {
    return this.service.addComment(
      user.tenantId, id, { userId: user.id, name: displayName(user) }, body?.body, body?.internal ?? false,
    );
  }

  // Requester view: public comments only.
  @Get('cases/:id/comments')
  @RequirePermission('hr:helpdesk:read')
  listComments(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listComments(user.tenantId, id, false);
  }

  // HR team view: includes internal notes.
  @Get('cases/:id/comments/all')
  @RequirePermission('hr:helpdesk:manage')
  listAllComments(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.listComments(user.tenantId, id, true);
  }

  // Requester rates the resolution (1-5), once.
  @Post('cases/:id/feedback')
  @RequirePermission('hr:helpdesk:read')
  submitFeedback(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { score: number; comment?: string }) {
    return this.service.submitFeedback(user.tenantId, id, user.id, body);
  }

  // ---- Routing rules ----
  @Get('routing-rules')
  @RequirePermission('hr:helpdesk:manage')
  listRoutingRules(@CurrentUser() user: any) {
    return this.service.listRoutingRules(user.tenantId);
  }

  @Post('routing-rules')
  @RequirePermission('hr:helpdesk:manage')
  createRoutingRule(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createRoutingRule(user.tenantId, dto);
  }

  @Patch('routing-rules/:id/deactivate')
  @RequirePermission('hr:helpdesk:manage')
  deactivateRoutingRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deactivateRoutingRule(user.tenantId, id);
  }

  // ---- SLA escalation sweep (also callable from the scheduler) ----
  @Post('sla/escalate')
  @RequirePermission('hr:helpdesk:manage')
  escalateOverdueSla(@CurrentUser() user: any) {
    return this.service.escalateOverdueSla(user.tenantId);
  }
}
