import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LearningService } from './learning.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { CreateCourseDto, EnrollDto, UpdateEnrollmentDto, UpsertSkillDto } from './dto/learning.dto';

@ApiTags('talent-learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/learning')
export class LearningController {
  constructor(private readonly service: LearningService) {}

  @Get('courses')
  @RequirePermission('talent:learning:read')
  listCourses(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listCourses(user.tenantId, pagination);
  }

  @Post('courses')
  @RequirePermission('talent:learning:manage')
  createCourse(@CurrentUser() user: any, @Body() dto: CreateCourseDto) {
    return this.service.createCourse(user.tenantId, dto);
  }

  @Post('enrollments')
  @RequirePermission('talent:learning:read')
  enroll(@CurrentUser() user: any, @Body() dto: EnrollDto) {
    return this.service.enroll(user.tenantId, dto);
  }

  @Patch('enrollments/:id')
  @RequirePermission('talent:learning:manage')
  updateEnrollment(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateEnrollmentDto) {
    return this.service.updateEnrollment(user.tenantId, id, dto);
  }

  @Get('enrollments/employee/:employeeId')
  @RequirePermission('talent:learning:read')
  getMyEnrollments(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.getMyEnrollments(user.tenantId, employeeId);
  }

  @Post('skills')
  @RequirePermission('talent:learning:manage')
  upsertSkill(@CurrentUser() user: any, @Body() dto: UpsertSkillDto) {
    return this.service.upsertSkill(user.tenantId, dto);
  }

  @Get('skills/employee/:employeeId')
  @RequirePermission('talent:learning:read')
  getEmployeeSkills(@CurrentUser() user: any, @Param('employeeId') employeeId: string) {
    return this.service.getEmployeeSkills(user.tenantId, employeeId);
  }
}
