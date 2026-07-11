import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AiCareerService } from './ai-career.service';

@ApiTags('ai-career')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/career')
export class AiCareerController {
  constructor(private readonly service: AiCareerService) {}

  @Get('status')
  @RequirePermission('ai:career:read')
  status() {
    return { llmEnabled: this.service.llmEnabled };
  }

  @Get('employees/:employeeId/job-matches')
  @RequirePermission('ai:career:read')
  @ApiOperation({ summary: 'Rank internal jobs (IJP) by skill fit for an employee' })
  jobMatches(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Query('limit') limit?: string, @Query('includeBlocked') includeBlocked?: string) {
    return this.service.matchInternalJobs(user.tenantId, employeeId, {
      limit: limit ? Number(limit) : undefined, includeBlocked: includeBlocked === 'true',
    });
  }

  @Get('role-clusters')
  @RequirePermission('ai:career:read')
  @ApiOperation({ summary: 'Cluster roles by shared skill requirements' })
  roleClusters(@CurrentUser() user: any, @Query('threshold') threshold?: string) {
    return this.service.clusterRoles(user.tenantId, threshold ? Number(threshold) : undefined);
  }

  @Get('employees/:employeeId/role-fit/:jobId')
  @RequirePermission('ai:career:read')
  @ApiOperation({ summary: 'Explore role fit: score, strengths and gaps against a job' })
  roleFit(@CurrentUser() user: any, @Param('employeeId') employeeId: string, @Param('jobId') jobId: string) {
    return this.service.exploreRoleFit(user.tenantId, employeeId, jobId);
  }

  @Post('reflection')
  @RequirePermission('ai:career:read')
  @ApiOperation({ summary: 'Career reflection narrative (LLM when enabled, else a structured summary)' })
  reflection(@CurrentUser() user: any, @Body() dto: { employeeName: string; currentRole?: string; topSkills: string[]; aspirations?: string; recentGrowth?: string[] }) {
    return this.service.careerReflection(dto);
  }
}
