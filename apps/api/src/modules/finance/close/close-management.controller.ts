import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CloseManagementService } from './close-management.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CloseTaskStatus } from './entities/close-task.entity';

@ApiTags('finance-close')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/close')
export class CloseManagementController {
  constructor(private readonly service: CloseManagementService) {}

  // ─── Ph-131: tasks ────────────────────────────────────────────────
  @Get('tasks')
  @RequirePermission('finance:periods:manage')
  @ApiQuery({ name: 'periodId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listTasks(@CurrentUser() u: any, @Query('periodId') periodId?: string, @Query('status') status?: CloseTaskStatus) {
    return this.service.listTasks(u.tenantId, { periodId, status });
  }

  @Post('tasks')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Create a close task' })
  createTask(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createTask(u.tenantId, body);
  }

  @Post('tasks/:id/:action')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Transition a task: start | prepare | certify | reject | reopen' })
  transition(@CurrentUser() u: any, @Param('id') id: string, @Param('action') action: any, @Body() body: any) {
    return this.service.transitionTask(u.tenantId, id, action, body ?? {});
  }

  // ─── Ph-132: reconciliations ──────────────────────────────────────
  @Get('reconciliations')
  @RequirePermission('finance:periods:manage')
  @ApiQuery({ name: 'periodId', required: false })
  listRecons(@CurrentUser() u: any, @Query('periodId') periodId?: string) {
    return this.service.listReconciliations(u.tenantId, periodId);
  }

  @Post('reconciliations')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Create an account reconciliation (pulls live GL balance)' })
  createRecon(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createReconciliation(u.tenantId, body);
  }

  @Post('reconciliations/:id/schedule-items')
  @RequirePermission('finance:periods:manage')
  addScheduleItem(@CurrentUser() u: any, @Param('id') id: string, @Body() body: any) {
    return this.service.addScheduleItem(u.tenantId, id, body);
  }

  @Post('reconciliations/:id/refresh')
  @RequirePermission('finance:periods:manage')
  refreshRecon(@CurrentUser() u: any, @Param('id') id: string) {
    return this.service.refreshReconciliation(u.tenantId, id);
  }

  @Post('reconciliations/:id/:action')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Reconciliation action: prepare | certify | reject' })
  reconAction(@CurrentUser() u: any, @Param('id') id: string, @Param('action') action: any, @Body() body: any) {
    return this.service.reconAction(u.tenantId, id, action, { userId: u.id, ...(body ?? {}) });
  }

  // ─── Ph-133: dashboard ────────────────────────────────────────────
  @Get('dashboard/:periodId')
  @RequirePermission('finance:periods:manage')
  @ApiOperation({ summary: 'Close calendar dashboard for a period' })
  dashboard(@CurrentUser() u: any, @Param('periodId') periodId: string) {
    return this.service.closeDashboard(u.tenantId, periodId);
  }
}
