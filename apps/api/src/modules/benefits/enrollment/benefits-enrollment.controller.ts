import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BenefitsEnrollmentService } from './benefits-enrollment.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WindowStatus } from './entities/enrollment-window.entity';
import { LifeEventStatus } from './entities/life-event.entity';

@ApiTags('benefits-enrollment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('benefits/enrollment')
export class BenefitsEnrollmentController {
  constructor(private readonly service: BenefitsEnrollmentService) {}

  // ─── Ph-178: windows ──────────────────────────────────────────────
  @Get('windows')
  @RequirePermission('hr:read')
  listWindows(@CurrentUser() u: any) { return this.service.listWindows(u.tenantId); }

  @Post('windows')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Create an enrollment window' })
  createWindow(@CurrentUser() u: any, @Body() b: any) { return this.service.createWindow(u.tenantId, b); }

  @Post('windows/:id/status')
  @RequirePermission('hr:manage')
  setStatus(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { status: WindowStatus }) { return this.service.setWindowStatus(u.tenantId, id, b.status); }

  // ─── Ph-179: life events ──────────────────────────────────────────
  @Get('life-events')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listEvents(@CurrentUser() u: any, @Query('employeeId') employeeId?: string, @Query('status') status?: LifeEventStatus) {
    return this.service.listLifeEvents(u.tenantId, { employeeId, status });
  }

  @Post('life-events')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Record a life event (opens a 30-day election window)' })
  recordEvent(@CurrentUser() u: any, @Body() b: any) { return this.service.recordLifeEvent(u.tenantId, b); }

  @Post('life-events/:id/complete')
  @RequirePermission('hr:manage')
  complete(@CurrentUser() u: any, @Param('id') id: string) { return this.service.completeLifeEvent(u.tenantId, id); }

  @Post('life-events/expire-lapsed')
  @RequirePermission('hr:manage')
  expire(@CurrentUser() u: any, @Body() b: { asOf: string }) { return this.service.expireLapsedEvents(u.tenantId, b.asOf); }

  // ─── eligibility + deductions ─────────────────────────────────────
  @Get('can-elect')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Check if an employee may elect benefits on a date' })
  canElect(@CurrentUser() u: any, @Query('employeeId') employeeId: string, @Query('onDate') onDate: string) {
    return this.service.canElect(u.tenantId, employeeId, onDate);
  }

  @Post('compute-deduction')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Compute per-period employee/employer benefit deduction' })
  computeDeduction(@CurrentUser() u: any, @Body() b: { planId: string; payPeriods: number; annualSalary?: number }) {
    return this.service.computeDeduction(u.tenantId, b.planId, b.payPeriods, b.annualSalary ?? 0);
  }
}
