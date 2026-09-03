import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CollaborationService } from './collaboration.service';
import { CollaboratorType, CollaboratorResourceType, AssignmentStatus, SubmissionKind, SubmissionStatus } from './entities/collaborator.entity';

@ApiTags('external-collaborators')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('collaboration')
export class CollaborationController {
  constructor(private readonly service: CollaborationService) {}

  // ---- Collaborator administration ----
  @Get('collaborators')
  @RequirePermission('platform:collaborators:read')
  list(@CurrentUser() user: any, @Query('type') type?: CollaboratorType) {
    return this.service.listCollaborators(user.tenantId, type);
  }

  @Post('collaborators')
  @RequirePermission('platform:collaborators:manage')
  @ApiOperation({ summary: 'Invite an external recruiter / BGV vendor / travel agent' })
  invite(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.invite(user.tenantId, { ...dto, invitedByUserId: user.id });
  }

  @Get('collaborators/:id')
  @RequirePermission('platform:collaborators:read')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCollaborator(user.tenantId, id);
  }

  @Post('collaborators/:id/activate')
  @RequirePermission('platform:collaborators:manage')
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activate(user.tenantId, id);
  }

  @Post('collaborators/:id/suspend')
  @RequirePermission('platform:collaborators:manage')
  suspend(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.suspend(user.tenantId, id);
  }

  @Patch('collaborators/:id/scopes')
  @RequirePermission('platform:collaborators:manage')
  setScopes(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { scopes: string[] }) {
    return this.service.setScopes(user.tenantId, id, body?.scopes ?? []);
  }

  // ---- Assignments ----
  @Get('collaborators/:id/assignments')
  @RequirePermission('platform:collaborators:read')
  listAssignments(@CurrentUser() user: any, @Param('id') id: string, @Query('status') status?: AssignmentStatus) {
    return this.service.listAssignments(user.tenantId, id, status);
  }

  @Post('collaborators/:id/assignments')
  @RequirePermission('platform:collaborators:manage')
  @ApiOperation({ summary: 'Grant a collaborator record-level access to a job / BGV case / travel request' })
  assign(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { resourceType: CollaboratorResourceType; resourceId: string; resourceLabel?: string; dueDate?: string }) {
    return this.service.assignResource(user.tenantId, id, { ...dto, assignedByUserId: user.id });
  }

  @Post('assignments/:assignmentId/close')
  @RequirePermission('platform:collaborators:manage')
  closeAssignment(@CurrentUser() user: any, @Param('assignmentId') assignmentId: string) {
    return this.service.closeAssignment(user.tenantId, assignmentId);
  }

  // ---- Submissions (collaborator-facing + internal review) ----
  @Post('collaborators/:id/assignments/:assignmentId/submit')
  @RequirePermission('platform:collaborators:portal')
  @ApiOperation({ summary: 'Collaborator submits a candidate / BGV result / travel quote (record-scoped)' })
  submit(@CurrentUser() user: any, @Param('id') id: string, @Param('assignmentId') assignmentId: string, @Body() dto: { kind: SubmissionKind; payload: Record<string, any>; asOf?: string }) {
    const asOf = dto?.asOf ?? new Date().toISOString().slice(0, 10);
    return this.service.submit(user.tenantId, id, assignmentId, { kind: dto.kind, payload: dto.payload }, asOf);
  }

  @Get('submissions')
  @RequirePermission('platform:collaborators:read')
  listSubmissions(@CurrentUser() user: any, @Query('assignmentId') assignmentId?: string, @Query('collaboratorId') collaboratorId?: string, @Query('status') status?: SubmissionStatus) {
    return this.service.listSubmissions(user.tenantId, { assignmentId, collaboratorId, status });
  }

  @Post('submissions/:submissionId/review')
  @RequirePermission('platform:collaborators:manage')
  review(@CurrentUser() user: any, @Param('submissionId') submissionId: string, @Body() body: { accept: boolean; note?: string }) {
    return this.service.reviewSubmission(user.tenantId, submissionId, { accept: body.accept, note: body.note, reviewedByUserId: user.id });
  }
}
