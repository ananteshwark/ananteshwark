import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AppraisalService } from './appraisal.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateAppraisalResultDto } from './dto/appraisal.dto';

@ApiTags('talent-appraisal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/appraisal')
export class AppraisalController {
  constructor(private readonly service: AppraisalService) {}

  @Get('results')
  @RequirePermission('talent:appraisal:read')
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('reviewCycleId') reviewCycleId?: string) {
    return this.service.listAppraisalResults(user.tenantId, pagination, reviewCycleId);
  }

  @Post('results')
  @RequirePermission('talent:appraisal:manage')
  create(@CurrentUser() user: any, @Body() dto: CreateAppraisalResultDto) {
    return this.service.createAppraisalResult(user.tenantId, dto);
  }

  @Post('results/:id/approve')
  @RequirePermission('talent:appraisal:manage')
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveAppraisalResult(user.tenantId, id, user.id);
  }

  @Get('employee/:employeeId/history')
  @RequirePermission('talent:appraisal:read')
  history(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.getEmployeeAppraisalHistory(user.tenantId, employeeId);
  }
}
