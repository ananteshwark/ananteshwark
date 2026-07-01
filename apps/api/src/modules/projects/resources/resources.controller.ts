import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ResourcesService } from './resources.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceRequestStatus } from './entities/resource-request.entity';

@ApiTags('project-resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('projects/resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  // ─── Ph-242: pool ─────────────────────────────────────────────────
  @Get()
  @RequirePermission('projects:read')
  list(@CurrentUser() u: any) { return this.service.listResources(u.tenantId); }

  @Post()
  @RequirePermission('projects:manage')
  create(@CurrentUser() u: any, @Body() b: any) { return this.service.createResource(u.tenantId, b); }

  @Get('by-skill')
  @RequirePermission('projects:read')
  @ApiQuery({ name: 'skill', required: true })
  @ApiQuery({ name: 'grade', required: false })
  bySkill(@CurrentUser() u: any, @Query('skill') skill: string, @Query('grade') grade?: string) { return this.service.findBySkill(u.tenantId, skill, grade); }

  // ─── Ph-243: requests ─────────────────────────────────────────────
  @Get('requests')
  @RequirePermission('projects:read')
  @ApiQuery({ name: 'status', required: false })
  listRequests(@CurrentUser() u: any, @Query('status') status?: ResourceRequestStatus) { return this.service.listRequests(u.tenantId, status); }

  @Post('requests')
  @RequirePermission('projects:manage')
  createRequest(@CurrentUser() u: any, @Body() b: any) { return this.service.createRequest(u.tenantId, { ...b, requestedBy: b.requestedBy ?? u.id }); }

  @Post('requests/:id/fulfill')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Fulfill a resource request from the pool' })
  fulfill(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { resourceId: string }) { return this.service.fulfillRequest(u.tenantId, id, b.resourceId); }

  @Post('requests/:id/reject')
  @RequirePermission('projects:manage')
  reject(@CurrentUser() u: any, @Param('id') id: string) { return this.service.rejectRequest(u.tenantId, id); }

  // ─── Ph-244: utilization ──────────────────────────────────────────
  @Post('allocations')
  @RequirePermission('projects:manage')
  allocate(@CurrentUser() u: any, @Body() b: any) { return this.service.allocate(u.tenantId, b); }

  @Get('utilization')
  @RequirePermission('projects:read')
  @ApiOperation({ summary: 'Weekly utilization with over/under-allocation flags' })
  @ApiQuery({ name: 'week', required: true })
  @ApiQuery({ name: 'underThresholdPct', required: false })
  utilization(@CurrentUser() u: any, @Query('week') week: string, @Query('underThresholdPct') underThresholdPct?: string) {
    return this.service.utilization(u.tenantId, week, underThresholdPct ? Number(underThresholdPct) : 60);
  }
}
