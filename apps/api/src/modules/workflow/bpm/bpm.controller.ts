import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BpmService } from './bpm.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ApprovalTaskStatus } from './entities/approval-task.entity';

@ApiTags('workflow-bpm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('workflow/bpm')
export class BpmController {
  constructor(private readonly service: BpmService) {}

  // ─── Ph-259: process designer ─────────────────────────────────────
  @Get('processes')
  @RequirePermission('workflow:read')
  listProcesses(@CurrentUser() u: any) { return this.service.listProcesses(u.tenantId); }

  @Post('processes')
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: 'Create a BPM process (stages, swimlanes, gateways)' })
  createProcess(@CurrentUser() u: any, @Body() b: any) { return this.service.createProcess(u.tenantId, b); }

  // ─── Ph-256: instances + routing ──────────────────────────────────
  @Post('processes/:id/start')
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: 'Start a process instance for a subject' })
  start(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { subjectRef: string; startAt: string }) {
    return this.service.start(u.tenantId, id, b.subjectRef, b.startAt);
  }

  @Post('tasks/:taskId/decide')
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: 'Approve/reject an approval task' })
  decide(@CurrentUser() u: any, @Param('taskId') taskId: string, @Body() b: { decision: 'APPROVE' | 'REJECT'; at: string; comment?: string }) {
    return this.service.decide(u.tenantId, taskId, u.id, b.decision, b.at, b.comment);
  }

  @Get('tasks')
  @RequirePermission('workflow:read')
  @ApiQuery({ name: 'assignedTo', required: false })
  @ApiQuery({ name: 'status', required: false })
  listTasks(@CurrentUser() u: any, @Query('assignedTo') assignedTo?: string, @Query('status') status?: ApprovalTaskStatus) {
    return this.service.listTasks(u.tenantId, assignedTo ?? u.id, status);
  }

  @Get('instances/:id')
  @RequirePermission('workflow:read')
  instance(@CurrentUser() u: any, @Param('id') id: string) { return this.service.getInstance(u.tenantId, id); }

  // ─── Ph-257: escalation ───────────────────────────────────────────
  @Post('check-escalations')
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: 'Escalate overdue pending tasks' })
  checkEscalations(@CurrentUser() u: any, @Body() b: { now: string }) { return this.service.checkEscalations(u.tenantId, b.now); }

  // ─── Ph-258: delegation ───────────────────────────────────────────
  @Post('delegations')
  @RequirePermission('workflow:manage')
  @ApiOperation({ summary: 'Set a vacation/delegation rule' })
  setDelegation(@CurrentUser() u: any, @Body() b: any) { return this.service.setDelegation(u.tenantId, { ...b, userId: b.userId ?? u.id }); }
}
