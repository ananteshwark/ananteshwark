import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProjectBillingService } from './project-billing.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('project-billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('projects/billing')
export class ProjectBillingController {
  constructor(private readonly service: ProjectBillingService) {}

  // ─── Ph-237: budgets ──────────────────────────────────────────────
  @Post(':projectId/budget')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Create a baseline project budget' })
  createBudget(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: { lines: any[]; notes?: string }) {
    return this.service.createBudget(u.tenantId, projectId, b.lines, b.notes);
  }

  @Post(':projectId/budget/revise')
  @RequirePermission('projects:manage')
  revise(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: { lines: any[]; notes?: string }) {
    return this.service.reviseBudget(u.tenantId, projectId, b.lines, b.notes);
  }

  @Get(':projectId/budget/lines')
  @RequirePermission('projects:read')
  budgetLines(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.activeBudgetLines(u.tenantId, projectId); }

  // ─── rates ────────────────────────────────────────────────────────
  @Post('rates')
  @RequirePermission('projects:manage')
  setRate(@CurrentUser() u: any, @Body() b: any) { return this.service.setRate(u.tenantId, b); }

  // ─── Ph-238: budget vs actual ─────────────────────────────────────
  @Get(':projectId/budget-vs-actual')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Budget vs actual with EAC per task' })
  budgetVsActual(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.budgetVsActual(u.tenantId, projectId); }

  // ─── Ph-239: T&M billing ──────────────────────────────────────────
  @Get(':projectId/tm-invoice')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Generate a T&M invoice draft' })
  @ApiQuery({ name: 'fromDate', required: true })
  @ApiQuery({ name: 'toDate', required: true })
  tmInvoice(@CurrentUser() u: any, @Param('projectId') projectId: string, @Query('fromDate') fromDate: string, @Query('toDate') toDate: string) {
    return this.service.generateTmInvoice(u.tenantId, projectId, fromDate, toDate);
  }

  // ─── Ph-240: fixed-price schedule ─────────────────────────────────
  @Post('fixed-price-schedule')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Compute a fixed-price milestone billing schedule' })
  fixedPriceSchedule(@CurrentUser() _u: any, @Body() b: { contractValue: number; milestones: any[] }) {
    return this.service.fixedPriceSchedule(b.contractValue, b.milestones);
  }

  // ─── Ph-241: revenue recognition ──────────────────────────────────
  @Post(':projectId/recognize/poc')
  @RequirePermission('projects:manage')
  recognizePoc(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.recognizePoc(u.tenantId, { ...b, projectId });
  }

  @Post(':projectId/recognize/milestone')
  @RequirePermission('projects:manage')
  recognizeMilestone(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.recognizeMilestone(u.tenantId, { ...b, projectId });
  }

  @Post(':projectId/recognize/completed')
  @RequirePermission('projects:manage')
  recognizeCompleted(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.recognizeCompleted(u.tenantId, { ...b, projectId });
  }

  @Get(':projectId/recognition-history')
  @RequirePermission('projects:read')
  history(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.recognitionHistory(u.tenantId, projectId); }
}
