import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('hr-skills')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/skills')
export class SkillsController {
  constructor(private readonly service: SkillsService) {}

  // ─── Ph-187: taxonomy ─────────────────────────────────────────────
  @Get('categories')
  @RequirePermission('hr:read')
  listCategories(@CurrentUser() u: any) { return this.service.listCategories(u.tenantId); }

  @Post('categories')
  @RequirePermission('hr:manage')
  createCategory(@CurrentUser() u: any, @Body() b: any) { return this.service.createCategory(u.tenantId, b); }

  @Patch('categories/:id')
  @RequirePermission('hr:manage')
  updateCategory(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateCategory(u.tenantId, id, b); }

  @Get('catalog')
  @RequirePermission('hr:read')
  @ApiQuery({ name: 'categoryId', required: false })
  listSkills(@CurrentUser() u: any, @Query('categoryId') categoryId?: string) { return this.service.listSkills(u.tenantId, categoryId); }

  @Post('catalog')
  @RequirePermission('hr:manage')
  createSkill(@CurrentUser() u: any, @Body() b: any) { return this.service.createSkill(u.tenantId, b); }

  @Patch('catalog/:id')
  @RequirePermission('hr:manage')
  updateSkill(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateSkill(u.tenantId, id, b); }

  // ─── Ph-188: employee profile ─────────────────────────────────────
  @Get('employees/:employeeId')
  @RequirePermission('hr:read')
  listEmployeeSkills(@CurrentUser() u: any, @Param('employeeId') employeeId: string) {
    return this.service.listEmployeeSkills(u.tenantId, employeeId);
  }

  @Post('employees')
  @RequirePermission('hr:manage')
  @ApiOperation({ summary: 'Assign or update an employee skill proficiency' })
  assignSkill(@CurrentUser() u: any, @Body() b: any) { return this.service.assignSkill(u.tenantId, b); }

  @Delete('employees/:id')
  @RequirePermission('hr:manage')
  removeEmployeeSkill(@CurrentUser() u: any, @Param('id') id: string) { return this.service.removeEmployeeSkill(u.tenantId, id); }

  // ─── Ph-189: job requirements + gap analysis ──────────────────────
  @Get('jobs/:jobId/requirements')
  @RequirePermission('hr:read')
  listJobRequirements(@CurrentUser() u: any, @Param('jobId') jobId: string) {
    return this.service.listJobRequirements(u.tenantId, jobId);
  }

  @Post('jobs/requirements')
  @RequirePermission('hr:manage')
  setJobRequirement(@CurrentUser() u: any, @Body() b: any) { return this.service.setJobRequirement(u.tenantId, b); }

  @Get('gap')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Gap analysis: employee vs job requirements' })
  @ApiQuery({ name: 'employeeId', required: true })
  @ApiQuery({ name: 'jobId', required: true })
  gapAnalysis(@CurrentUser() u: any, @Query('employeeId') employeeId: string, @Query('jobId') jobId: string) {
    return this.service.gapAnalysis(u.tenantId, employeeId, jobId);
  }

  @Post('department-gap')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Department-level gap rollup across employees' })
  departmentGap(@CurrentUser() u: any, @Body() b: { jobId: string; employeeIds: string[] }) {
    return this.service.departmentGap(u.tenantId, b.jobId, b.employeeIds);
  }

  // ─── Ph-190: learning recommendations ─────────────────────────────
  @Get('recommend-learning')
  @RequirePermission('hr:read')
  @ApiOperation({ summary: 'Recommend courses to close skill gaps' })
  @ApiQuery({ name: 'employeeId', required: true })
  @ApiQuery({ name: 'jobId', required: true })
  recommendLearning(@CurrentUser() u: any, @Query('employeeId') employeeId: string, @Query('jobId') jobId: string) {
    return this.service.recommendLearning(u.tenantId, employeeId, jobId);
  }
}
