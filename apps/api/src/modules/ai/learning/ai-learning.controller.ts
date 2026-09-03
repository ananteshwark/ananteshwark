import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AiLearningService } from './ai-learning.service';

@ApiTags('ai-learning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/learning')
export class AiLearningController {
  constructor(private readonly service: AiLearningService) {}

  @Post('infer-skills')
  @RequirePermission('ai:learning:read')
  @ApiOperation({ summary: 'Infer likely skills from free-text signals (title, projects, courses)' })
  inferSkills(@CurrentUser() user: any, @Body() body: { signals: string[] }) {
    return this.service.inferForEmployee(user.tenantId, body?.signals ?? []);
  }

  @Get('course-skill-map')
  @RequirePermission('ai:learning:read')
  @ApiOperation({ summary: 'Map active courses to the catalog skills they develop' })
  courseSkillMap(@CurrentUser() user: any) {
    return this.service.mapCoursesToSkills(user.tenantId);
  }

  @Get('recommend/:employeeId/:jobId')
  @RequirePermission('ai:learning:read')
  @ApiOperation({ summary: 'Recommend courses to close an employee\'s gaps against a job' })
  recommend(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Param('jobId') jobId: string, @Query('limit') limit?: string) {
    return this.service.recommendForJob(user.tenantId, employeeId, jobId, limit ? Number(limit) : undefined);
  }

  @Get('search')
  @RequirePermission('ai:learning:read')
  @ApiOperation({ summary: 'Search the course catalog by query' })
  search(@CurrentUser() user: any, @Query('q') q: string, @Query('limit') limit?: string) {
    return this.service.searchCourses(user.tenantId, q, limit ? Number(limit) : undefined);
  }
}
