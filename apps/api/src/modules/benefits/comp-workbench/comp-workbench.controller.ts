import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CompWorkbenchService } from './comp-workbench.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('comp-workbench')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('benefits/comp-workbench')
export class CompWorkbenchController {
  constructor(private readonly service: CompWorkbenchService) {}

  // ─── Ph-182: budget envelopes ─────────────────────────────────────
  @Get('budgets')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'cycleId', required: false })
  listBudgets(@CurrentUser() u: any, @Query('cycleId') cycleId?: string) {
    return this.service.listBudgets(u.tenantId, cycleId);
  }

  @Post('budgets')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Create a compensation budget envelope' })
  createBudget(@CurrentUser() u: any, @Body() b: any) { return this.service.createBudget(u.tenantId, b); }

  // ─── Ph-183: worksheet (awards) ───────────────────────────────────
  @Get('awards')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'cycleId', required: true })
  listAwards(@CurrentUser() u: any, @Query('cycleId') cycleId: string) {
    return this.service.listAwards(u.tenantId, cycleId);
  }

  @Post('awards')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Propose a compensation award (budget-gated)' })
  proposeAward(@CurrentUser() u: any, @Body() b: any) { return this.service.proposeAward(u.tenantId, b); }

  @Patch('awards/:id')
  @RequirePermission('hr:manage')
  updateAward(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { amount: number }) {
    return this.service.updateAward(u.tenantId, id, b.amount);
  }

  // ─── Ph-184: approval workflow ────────────────────────────────────
  @Post('awards/:id/submit')
  @RequirePermission('hr:manage')
  submit(@CurrentUser() u: any, @Param('id') id: string) { return this.service.submit(u.tenantId, id, u.id); }

  @Post('awards/:id/approve')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Advance an award one stage (manager → HR → finance)' })
  approve(@CurrentUser() u: any, @Param('id') id: string) { return this.service.approve(u.tenantId, id, u.id); }

  @Post('awards/:id/reject')
  @RequirePermission('hr:manage')
  reject(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { reason?: string }) {
    return this.service.reject(u.tenantId, id, u.id, b?.reason);
  }

  // ─── Ph-185: salary change execution ──────────────────────────────
  @Post('awards/:id/execute')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Execute an APPROVED award into an assignment change' })
  execute(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { assignmentChangeId: string }) {
    return this.service.execute(u.tenantId, id, b.assignmentChangeId);
  }

  // ─── Ph-186: total compensation statement ─────────────────────────
  @Get('total-comp')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Total compensation statement for an employee' })
  @ApiQuery({ name: 'employeeId', required: true })
  @ApiQuery({ name: 'baseSalary', required: false })
  @ApiQuery({ name: 'employerBenefits', required: false })
  totalComp(
    @CurrentUser() u: any,
    @Query('employeeId') employeeId: string,
    @Query('baseSalary') baseSalary?: string,
    @Query('employerBenefits') employerBenefits?: string,
  ) {
    return this.service.totalCompStatement(u.tenantId, employeeId, Number(baseSalary ?? 0), Number(employerBenefits ?? 0));
  }
}
