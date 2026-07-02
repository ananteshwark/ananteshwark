import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HeadcountService } from './headcount.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('hr-headcount')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/headcount')
export class HeadcountController {
  constructor(private readonly service: HeadcountService) {}

  // ─── Ph-191: position budgeting ───────────────────────────────────
  @Get('budgets')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'fiscalYear', required: false })
  listBudgets(@CurrentUser() u: any, @Query('fiscalYear') fiscalYear?: string) {
    return this.service.listBudgets(u.tenantId, fiscalYear ? Number(fiscalYear) : undefined);
  }

  @Post('budgets')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Create a position headcount budget' })
  createBudget(@CurrentUser() u: any, @Body() b: any) { return this.service.createBudget(u.tenantId, b); }

  @Patch('budgets/:id')
  @RequirePermission('hr:manage')
  updateBudget(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateBudget(u.tenantId, id, b); }

  // ─── Ph-192: headcount control ────────────────────────────────────
  @Get('check')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Check a hire against position budget (OK/WARN/BLOCK)' })
  @ApiQuery({ name: 'positionId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: true })
  @ApiQuery({ name: 'requestedFte', required: false })
  check(@CurrentUser() u: any, @Query('positionId') positionId: string, @Query('fiscalYear') fiscalYear: string, @Query('requestedFte') requestedFte?: string) {
    return this.service.checkHeadcount(u.tenantId, positionId, Number(fiscalYear), requestedFte ? Number(requestedFte) : 1);
  }

  @Post('validate-hire')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Validate a hire/transfer; throws if blocked' })
  validateHire(@CurrentUser() u: any, @Body() b: { positionId: string; fiscalYear: number; requestedFte?: number }) {
    return this.service.validateHire(u.tenantId, b.positionId, b.fiscalYear, b.requestedFte ?? 1);
  }

  // ─── Ph-193: workforce planning scenarios ─────────────────────────
  @Get('scenarios')
  @RequirePermission('hr:read')
  listScenarios(@CurrentUser() u: any) { return this.service.listScenarios(u.tenantId); }

  @Post('scenarios')
  @RequirePermission('hr:manage')
  createScenario(@CurrentUser() u: any, @Body() b: any) { return this.service.createScenario(u.tenantId, b); }

  @Post('scenarios/:id/changes')
  @RequirePermission('hr:manage')
  addChange(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.addChange(u.tenantId, id, b); }

  @Get('scenarios/:id/projection')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Project a scenario against live baselines (non-destructive)' })
  project(@CurrentUser() u: any, @Param('id') id: string) { return this.service.project(u.tenantId, id); }

  @Post('scenarios/:id/finalize')
  @RequirePermission('hr:manage')
  finalize(@CurrentUser() u: any, @Param('id') id: string) { return this.service.finalize(u.tenantId, id); }

  @Post('scenarios/:id/discard')
  @RequirePermission('hr:manage')
  discard(@CurrentUser() u: any, @Param('id') id: string) { return this.service.discard(u.tenantId, id); }
}
