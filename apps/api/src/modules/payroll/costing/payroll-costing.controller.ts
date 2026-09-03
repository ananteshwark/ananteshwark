import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PayrollCostingService } from './payroll-costing.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('payroll-costing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll/costing')
export class PayrollCostingController {
  constructor(private readonly service: PayrollCostingService) {}

  // ─── Ph-174: rules ────────────────────────────────────────────────
  @Get('rules')
  @RequirePermission('payroll:read')
  @ApiQuery({ name: 'componentCode', required: false })
  listRules(@CurrentUser() u: any, @Query('componentCode') componentCode?: string) { return this.service.listRules(u.tenantId, componentCode); }

  @Post('rules')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Create a payroll costing rule' })
  createRule(@CurrentUser() u: any, @Body() b: any) { return this.service.createRule(u.tenantId, b); }

  @Delete('rules/:id')
  @RequirePermission('payroll:manage')
  deleteRule(@CurrentUser() u: any, @Param('id') id: string) { return this.service.deleteRule(u.tenantId, id); }

  // ─── Ph-175: distribution ─────────────────────────────────────────
  @Post('runs/:runId/distribute')
  @RequirePermission('payroll:manage')
  @ApiOperation({ summary: 'Distribute a run\'s element costs across cost centers/projects' })
  distribute(@CurrentUser() u: any, @Param('runId') runId: string, @Body() b: { lines: any[] }) {
    return this.service.distribute(u.tenantId, runId, b.lines);
  }

  @Get('runs/:runId/distribution')
  @RequirePermission('payroll:read')
  listDistribution(@CurrentUser() u: any, @Param('runId') runId: string) { return this.service.listDistribution(u.tenantId, runId); }

  // ─── Ph-176: labor report ─────────────────────────────────────────
  @Get('labor-report')
  @RequirePermission('payroll:read')
  @ApiOperation({ summary: 'Labor distribution report by cost center / project / account / component' })
  @ApiQuery({ name: 'payrollRunId', required: false })
  @ApiQuery({ name: 'groupBy', required: false })
  report(@CurrentUser() u: any, @Query('payrollRunId') payrollRunId?: string, @Query('groupBy') groupBy?: any) {
    return this.service.laborReport(u.tenantId, { payrollRunId, groupBy });
  }
}
