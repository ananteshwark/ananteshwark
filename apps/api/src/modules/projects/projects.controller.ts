import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ProjectStatus } from './entities/project.entity';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  // ─── Projects ─────────────────────────────────────────────────

  @Get()
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'List projects' })
  @ApiQuery({ name: 'status', required: false, enum: ProjectStatus })
  listProjects(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: ProjectStatus,
  ) {
    return this.service.findProjects(user.tenantId, pagination, { status });
  }

  @Get('dashboard')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get projects dashboard stats' })
  getDashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get project by ID' })
  getProject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findProject(user.tenantId, id);
  }

  @Get(':id/summary')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get project summary with stats' })
  getProjectSummary(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getProjectSummary(user.tenantId, id);
  }

  @Post()
  @RequirePermission('projects:create')
  @ApiOperation({ summary: 'Create project' })
  createProject(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createProject(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Update project' })
  updateProject(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateProject(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Delete project' })
  deleteProject(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteProject(user.tenantId, id);
  }

  // ─── Members ──────────────────────────────────────────────────

  @Get(':projectId/members')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'List project members' })
  listMembers(@CurrentUser() user: any, @Param('projectId') projectId: string) {
    return this.service.findMembers(user.tenantId, projectId);
  }

  @Post(':projectId/members')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Add project member' })
  addMember(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.service.addMember(user.tenantId, projectId, dto);
  }

  @Patch(':projectId/members/:id')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Update project member' })
  updateMember(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateMember(user.tenantId, projectId, id, dto);
  }

  @Delete(':projectId/members/:id')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Remove project member' })
  removeMember(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.removeMember(user.tenantId, projectId, id);
  }

  // ─── Tasks ────────────────────────────────────────────────────

  @Get(':projectId/tasks')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'List project tasks' })
  listTasks(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findTasks(user.tenantId, projectId, pagination);
  }

  @Get(':projectId/tasks/:id')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get task by ID' })
  getTask(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findTask(user.tenantId, projectId, id);
  }

  @Post(':projectId/tasks')
  @RequirePermission('projects:create')
  @ApiOperation({ summary: 'Create task' })
  createTask(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.service.createTask(user.tenantId, projectId, dto);
  }

  @Patch(':projectId/tasks/:id')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Update task' })
  updateTask(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateTask(user.tenantId, projectId, id, dto);
  }

  @Delete(':projectId/tasks/:id')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Delete task' })
  deleteTask(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteTask(user.tenantId, projectId, id);
  }

  // ─── Time Entries ─────────────────────────────────────────────

  @Get(':projectId/time-entries')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'List time entries' })
  listTimeEntries(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findTimeEntries(user.tenantId, projectId, pagination);
  }

  @Get(':projectId/time-entries/:id')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get time entry by ID' })
  getTimeEntry(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findTimeEntry(user.tenantId, projectId, id);
  }

  @Post(':projectId/time-entries')
  @RequirePermission('projects:create')
  @ApiOperation({ summary: 'Log time entry' })
  createTimeEntry(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.service.createTimeEntry(user.tenantId, projectId, dto);
  }

  @Patch(':projectId/time-entries/:id')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Update time entry' })
  updateTimeEntry(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateTimeEntry(user.tenantId, projectId, id, dto);
  }

  @Delete(':projectId/time-entries/:id')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Delete time entry' })
  deleteTimeEntry(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteTimeEntry(user.tenantId, projectId, id);
  }

  // ─── Expenses ─────────────────────────────────────────────────

  @Get(':projectId/expenses')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'List project expenses' })
  listExpenses(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findProjectExpenses(user.tenantId, projectId, pagination);
  }

  @Get(':projectId/expenses/:id')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Get project expense by ID' })
  getExpense(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.findProjectExpense(user.tenantId, projectId, id);
  }

  @Post(':projectId/expenses')
  @RequirePermission('projects:create')
  @ApiOperation({ summary: 'Create project expense' })
  createExpense(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Body() dto: any,
  ) {
    return this.service.createProjectExpense(user.tenantId, projectId, dto);
  }

  @Patch(':projectId/expenses/:id')
  @RequirePermission('projects:update')
  @ApiOperation({ summary: 'Update project expense' })
  updateExpense(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateProjectExpense(user.tenantId, projectId, id, dto);
  }

  @Delete(':projectId/expenses/:id')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Delete project expense' })
  deleteExpense(
    @CurrentUser() user: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteProjectExpense(user.tenantId, projectId, id);
  }
}
