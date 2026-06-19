import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PerformanceService } from './performance.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateReviewCycleDto, LaunchReviewsDto, SubmitReviewDto, CreateCalibrationDto, RecordCalibrationDto } from './dto/performance.dto';
import { FormType } from './entities/review-form.entity';

@ApiTags('talent-performance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/performance')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  @Get('cycles')
  @RequirePermission('talent:performance:read')
  listCycles(@CurrentUser() user: any) {
    return this.service.listReviewCycles(user.tenantId);
  }

  @Post('cycles')
  @RequirePermission('talent:performance:manage')
  createCycle(@CurrentUser() user: any, @Body() dto: CreateReviewCycleDto) {
    return this.service.createReviewCycle(user.tenantId, dto);
  }

  @Get('cycles/:id')
  @RequirePermission('talent:performance:read')
  getCycle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getReviewCycle(user.tenantId, id);
  }

  @Post('cycles/:id/launch')
  @RequirePermission('talent:performance:manage')
  launchReviews(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: LaunchReviewsDto) {
    return this.service.launchReviews(user.tenantId, id, dto);
  }

  @Get('forms')
  @RequirePermission('talent:performance:read')
  listForms(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('cycleId') cycleId?: string, @Query('employeeId') employeeId?: string, @Query('type') type?: FormType) {
    return this.service.listReviewForms(user.tenantId, pagination, { cycleId, employeeId, type });
  }

  @Post('forms/:id/submit')
  @RequirePermission('talent:performance:submit')
  submitReview(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SubmitReviewDto) {
    return this.service.submitReview(user.tenantId, id, dto);
  }

  @Post('calibrations')
  @RequirePermission('talent:performance:calibrate')
  createCalibration(@CurrentUser() user: any, @Body() dto: CreateCalibrationDto) {
    return this.service.createCalibrationSession(user.tenantId, dto);
  }

  @Post('calibrations/:id/record')
  @RequirePermission('talent:performance:calibrate')
  recordCalibration(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RecordCalibrationDto) {
    return this.service.recordCalibration(user.tenantId, id, dto);
  }

  @Post('calibrations/:id/complete')
  @RequirePermission('talent:performance:calibrate')
  completeCalibration(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.completeCalibration(user.tenantId, id);
  }

  @Get('summary/:cycleId/:employeeId')
  @RequirePermission('talent:performance:read')
  getSummary(@CurrentUser() user: any, @Param('cycleId') cycleId: string, @Param('employeeId') employeeId: string) {
    return this.service.getReviewSummary(user.tenantId, cycleId, employeeId);
  }
}
