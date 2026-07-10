import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ActionPlanningService } from './action-planning.service';
import { ActionPlanStatus, ActionItemStatus, WatchStatus } from './entities/action-planning.entity';

@ApiTags('action-planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('action-planning')
export class ActionPlanningController {
  constructor(private readonly service: ActionPlanningService) {}

  // ---- Survey action plans ----
  @Get('plans')
  @RequirePermission('engagement:actionplans:read')
  listPlans(@CurrentUser() user: any, @Query('status') status?: ActionPlanStatus) {
    return this.service.listPlans(user.tenantId, status);
  }

  @Post('plans')
  @RequirePermission('engagement:actionplans:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPlan(user.tenantId, { ...dto, ownerUserId: dto?.ownerUserId ?? user.id });
  }

  @Get('plans/:id')
  @RequirePermission('engagement:actionplans:read')
  getPlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPlan(user.tenantId, id);
  }

  @Post('plans/:id/items')
  @RequirePermission('engagement:actionplans:manage')
  addItem(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addItem(user.tenantId, id, dto);
  }

  @Patch('items/:itemId/status')
  @RequirePermission('engagement:actionplans:manage')
  updateItemStatus(@CurrentUser() user: any, @Param('itemId') itemId: string, @Body() body: { status: ActionItemStatus }) {
    return this.service.updateItemStatus(user.tenantId, itemId, body.status);
  }

  @Patch('plans/:id/status')
  @RequirePermission('engagement:actionplans:manage')
  setPlanStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: ActionPlanStatus }) {
    return this.service.setPlanStatus(user.tenantId, id, body.status);
  }

  // ---- Attrition watchlist ----
  @Get('attrition/watch')
  @RequirePermission('hr:attrition:read')
  listWatch(@CurrentUser() user: any, @Query('status') status?: WatchStatus, @Query('riskBand') riskBand?: string) {
    return this.service.listWatch(user.tenantId, { status, riskBand });
  }

  @Get('attrition/summary')
  @RequirePermission('hr:attrition:read')
  watchSummary(@CurrentUser() user: any) {
    return this.service.watchSummary(user.tenantId);
  }

  @Post('attrition/watch')
  @RequirePermission('hr:attrition:manage')
  @ApiOperation({ summary: 'Add / refresh an at-risk employee on the retention watchlist' })
  addToWatch(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.addToWatch(user.tenantId, { ...dto, ownerUserId: dto?.ownerUserId ?? user.id });
  }

  @Patch('attrition/watch/:id/status')
  @RequirePermission('hr:attrition:manage')
  updateWatchStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: WatchStatus }) {
    return this.service.updateWatchStatus(user.tenantId, id, body.status);
  }

  @Post('attrition/watch/:id/action')
  @RequirePermission('hr:attrition:manage')
  addRetentionAction(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { action: string; at?: string }) {
    return this.service.addRetentionAction(user.tenantId, id, { ...body, by: user.id });
  }
}
