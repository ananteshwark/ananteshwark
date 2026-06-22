import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TimeEvaluationService } from './time-evaluation.service';

@ApiTags('hr-time-evaluation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hr/time-evaluation')
export class TimeEvaluationController {
  constructor(private readonly timeEvalService: TimeEvaluationService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run time evaluation for a month' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  runEvaluation(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
    @Body() body: { employeeIds?: string[] },
  ) {
    return this.timeEvalService.runEvaluation(user.tenantId, parseInt(month), parseInt(year), body.employeeIds);
  }

  @Get('report')
  @ApiOperation({ summary: 'Monthly time evaluation report' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  getMonthlyReport(
    @CurrentUser() user: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.timeEvalService.getMonthlyReport(user.tenantId, parseInt(month), parseInt(year));
  }

  @Get('timecard/:employeeId')
  @ApiOperation({ summary: 'Employee timecard' })
  @ApiQuery({ name: 'month', type: Number })
  @ApiQuery({ name: 'year', type: Number })
  getEmployeeTimecard(
    @CurrentUser() user: any,
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.timeEvalService.getEmployeeTimecard(user.tenantId, employeeId, parseInt(month), parseInt(year));
  }

  @Get('rules')
  @ApiOperation({ summary: 'Get time evaluation rules' })
  getRules(@CurrentUser() user: any) {
    return this.timeEvalService.getRules(user.tenantId);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Save time evaluation rules' })
  saveRules(@CurrentUser() user: any, @Body() rules: any[]) {
    return this.timeEvalService.saveRules(user.tenantId, rules);
  }
}
