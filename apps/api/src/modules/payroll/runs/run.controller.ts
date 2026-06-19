import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RunService } from './run.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreatePayrollRunDto } from './dto/run.dto';

@ApiTags('payroll-runs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('payroll')
export class RunController {
  constructor(private readonly service: RunService) {}

  // Runs
  @Get('runs')
  @RequirePermission('payroll:runs:read')
  listRuns(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.service.listRuns(user.tenantId, pagination, { status });
  }

  @Get('runs/:id')
  @RequirePermission('payroll:runs:read')
  getRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getRunWithPayslips(user.tenantId, id);
  }

  @Post('runs')
  @RequirePermission('payroll:runs:process')
  createRun(@CurrentUser() user: any, @Body() dto: CreatePayrollRunDto) {
    return this.service.createRun(user.tenantId, dto);
  }

  @Post('runs/:id/process')
  @RequirePermission('payroll:runs:process')
  processRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.processRun(user.tenantId, id, user.id);
  }

  @Post('runs/:id/approve')
  @RequirePermission('payroll:runs:approve')
  approveRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveRun(user.tenantId, id, user.id);
  }

  @Post('runs/:id/mark-paid')
  @RequirePermission('payroll:runs:approve')
  markPaid(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.markPaid(user.tenantId, id, user.id);
  }

  @Post('runs/:id/cancel')
  @RequirePermission('payroll:runs:process')
  cancelRun(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelRun(user.tenantId, id);
  }

  // Payslips
  @Get('payslips')
  @RequirePermission('payroll:payslips:read')
  listPayslips(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('payrollRunId') payrollRunId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.listPayslips(user.tenantId, pagination, {
      payrollRunId,
      employeeId,
    });
  }

  @Get('payslips/:id')
  @RequirePermission('payroll:payslips:read')
  getPayslip(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPayslip(user.tenantId, id);
  }

  @Get('employees/:employeeId/payslips')
  @RequirePermission('payroll:payslips:read')
  getEmployeePayslips(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getEmployeePayslips(user.tenantId, employeeId);
  }
}
