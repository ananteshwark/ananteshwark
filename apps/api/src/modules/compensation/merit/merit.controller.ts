import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MeritService, IncrementModelInput } from './merit.service';
import { MeritPlanStatus } from './entities/merit-plan.entity';

@ApiTags('compensation-merit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('compensation/merit')
export class MeritController {
  constructor(private readonly service: MeritService) {}

  // ---- Plan lifecycle ----
  @Get('plans')
  @RequirePermission('compensation:merit:read')
  listPlans(@CurrentUser() user: any, @Query('status') status?: MeritPlanStatus) {
    return this.service.listPlans(user.tenantId, status);
  }

  @Get('plans/:id')
  @RequirePermission('compensation:merit:read')
  getPlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPlan(user.tenantId, id);
  }

  @Post('plans')
  @RequirePermission('compensation:merit:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPlan(user.tenantId, user.id, dto);
  }

  @Patch('plans/:id')
  @RequirePermission('compensation:merit:manage')
  @ApiOperation({ summary: 'Configure a DRAFT plan (geographies, increment ranges, approval depth)' })
  configurePlan(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.configurePlan(user.tenantId, id, dto);
  }

  @Post('plans/:id/model-grid')
  @RequirePermission('compensation:merit:manage')
  @ApiOperation({ summary: 'Generate an increment grid from a budget/multiplier questionnaire and apply it' })
  applyGrid(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: IncrementModelInput) {
    return this.service.applyIncrementGrid(user.tenantId, id, dto);
  }

  @Post('plans/:id/submit-hrbp')
  @RequirePermission('compensation:merit:manage')
  submitForHrbpReview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submitForHrbpReview(user.tenantId, id);
  }

  @Post('plans/:id/launch')
  @RequirePermission('compensation:merit:manage')
  launch(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.launch(user.tenantId, id);
  }

  @Post('plans/:id/approve')
  @RequirePermission('compensation:merit:approve')
  @ApiOperation({ summary: 'Approve the plan and generate salary-structure + letter outputs' })
  approvePlan(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approvePlan(user.tenantId, id);
  }

  @Get('plans/:id/outputs')
  @RequirePermission('compensation:merit:read')
  getOutputs(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getOutputs(user.tenantId, id);
  }

  @Get('plans/:id/bias-screen')
  @RequirePermission('compensation:merit:read')
  @ApiOperation({ summary: 'Screen proposed increments for demographic pay-equity gaps' })
  biasScreen(@CurrentUser() user: any, @Param('id') id: string, @Query('thresholdPct') thresholdPct?: string) {
    return this.service.biasScreen(user.tenantId, id, thresholdPct ? Number(thresholdPct) : undefined);
  }

  // ---- Budget tree ----
  @Post('plans/:id/budget-nodes')
  @RequirePermission('compensation:merit:manage')
  addBudgetNode(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addBudgetNode(user.tenantId, id, dto);
  }

  @Post('budget-nodes/:nodeId/redistribute')
  @RequirePermission('compensation:merit:manage')
  @ApiOperation({ summary: 'Redistribute a parent budget across its children' })
  redistributeBudget(@CurrentUser() user: any, @Param('nodeId') nodeId: string, @Body() body: { allocations: Array<{ nodeId: string; amount: number }> }) {
    return this.service.redistributeBudget(user.tenantId, nodeId, body?.allocations ?? []);
  }

  @Post('budget-nodes/:nodeId/delegate')
  @RequirePermission('compensation:merit:manage')
  delegateBudget(@CurrentUser() user: any, @Param('nodeId') nodeId: string, @Body() body: { delegatedToUserId: string | null }) {
    return this.service.delegateBudget(user.tenantId, nodeId, body?.delegatedToUserId ?? null);
  }

  @Get('plans/:id/budget-consumption')
  @RequirePermission('compensation:merit:read')
  budgetConsumption(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.budgetConsumption(user.tenantId, id);
  }

  // ---- Worksheet lines ----
  @Get('plans/:id/lines')
  @RequirePermission('compensation:merit:read')
  listLines(@CurrentUser() user: any, @Param('id') id: string, @Query('budgetId') budgetId?: string) {
    return this.service.listLines(user.tenantId, id, budgetId);
  }

  @Post('plans/:id/lines')
  @RequirePermission('compensation:merit:manage')
  addLine(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addLine(user.tenantId, id, dto);
  }

  @Post('lines/:lineId/propose')
  @RequirePermission('compensation:merit:propose')
  @ApiOperation({ summary: 'Propose an increment; recomputes salary/compa-ratio and raises alerts' })
  proposeIncrement(@CurrentUser() user: any, @Param('lineId') lineId: string, @Body() dto: { proposedPct: number }) {
    return this.service.proposeIncrement(user.tenantId, lineId, dto);
  }

  @Post('lines/:lineId/approve')
  @RequirePermission('compensation:merit:approve')
  approveLine(@CurrentUser() user: any, @Param('lineId') lineId: string) {
    return this.service.approveLine(user.tenantId, lineId);
  }

  @Post('lines/:lineId/reject')
  @RequirePermission('compensation:merit:approve')
  rejectLine(@CurrentUser() user: any, @Param('lineId') lineId: string) {
    return this.service.rejectLine(user.tenantId, lineId);
  }
}
