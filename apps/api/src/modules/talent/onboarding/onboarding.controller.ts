import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateTemplateDto, CreateOnboardingPlanDto, UpdateTaskStatusDto } from './dto/onboarding.dto';

@ApiTags('talent-onboarding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/onboarding')
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  @Get('templates')
  @RequirePermission('talent:onboarding:read')
  listTemplates(@CurrentUser() user: any) {
    return this.service.listTemplates(user.tenantId);
  }

  @Post('templates')
  @RequirePermission('talent:onboarding:manage')
  createTemplate(@CurrentUser() user: any, @Body() dto: CreateTemplateDto) {
    return this.service.createTemplate(user.tenantId, dto);
  }

  @Get('plans')
  @RequirePermission('talent:onboarding:read')
  listPlans(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPlans(user.tenantId, pagination);
  }

  @Post('plans')
  @RequirePermission('talent:onboarding:manage')
  createPlan(@CurrentUser() user: any, @Body() dto: CreateOnboardingPlanDto) {
    return this.service.createPlan(user.tenantId, dto);
  }

  @Get('employee/:employeeId')
  @RequirePermission('talent:onboarding:read')
  getEmployeeOnboarding(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.getEmployeeOnboarding(user.tenantId, employeeId);
  }

  @Patch('tasks/:taskId')
  @RequirePermission('talent:onboarding:manage')
  updateTask(@CurrentUser() user: any, @Param('taskId') taskId: string, @Body() dto: UpdateTaskStatusDto) {
    return this.service.updateTaskStatus(user.tenantId, taskId, dto);
  }
}
