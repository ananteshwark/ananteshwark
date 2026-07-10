import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PeopleAnalyticsService } from './people-analytics.service';
import { AnalyticsTier, StoryboardStatus } from './entities/people-analytics.entity';

@ApiTags('people-analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/people')
export class PeopleAnalyticsController {
  constructor(private readonly service: PeopleAnalyticsService) {}

  // ---- Licences & seat limits ----
  @Put('seat-limits')
  @RequirePermission('analytics:people:admin')
  setSeatLimits(@CurrentUser() user: any, @Body() body: { limits: Partial<Record<AnalyticsTier, number | null>> }) {
    return this.service.setSeatLimits(user.tenantId, body?.limits ?? {});
  }

  @Get('licenses')
  @RequirePermission('analytics:people:admin')
  listLicenses(@CurrentUser() user: any, @Query('tier') tier?: AnalyticsTier) {
    return this.service.listLicenses(user.tenantId, tier);
  }

  @Get('licenses/summary')
  @RequirePermission('analytics:people:admin')
  licenseSummary(@CurrentUser() user: any) {
    return this.service.licenseSummary(user.tenantId);
  }

  @Post('licenses')
  @RequirePermission('analytics:people:admin')
  @ApiOperation({ summary: 'Assign a VIEWER / EXPLORER / CREATOR licence (enforces seat caps)' })
  assignLicense(@CurrentUser() user: any, @Body() body: { userId: string; tier: AnalyticsTier }) {
    return this.service.assignLicense(user.tenantId, body.userId, body.tier, user.id);
  }

  // ---- Metric composer ----
  @Get('metrics')
  @RequirePermission('analytics:people:read')
  listMetrics(@CurrentUser() user: any) {
    return this.service.listMetrics(user.tenantId);
  }

  @Post('metrics')
  @RequirePermission('analytics:people:author')
  @ApiOperation({ summary: 'Compose a custom metric (requires EXPLORER+ licence)' })
  createMetric(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createMetric(user.tenantId, user.id, dto);
  }

  @Post('metrics/:key/compute')
  @RequirePermission('analytics:people:read')
  @ApiOperation({ summary: 'Compute a metric over a supplied row set' })
  computeMetric(@CurrentUser() user: any, @Param('key') key: string, @Body() body: { rows: any[] }) {
    return this.service.computeMetric(user.tenantId, key, body?.rows ?? []);
  }

  // ---- Storyboards ----
  @Get('storyboards')
  @RequirePermission('analytics:people:read')
  listStoryboards(@CurrentUser() user: any, @Query('status') status?: StoryboardStatus) {
    return this.service.listStoryboards(user.tenantId, status);
  }

  @Post('storyboards')
  @RequirePermission('analytics:people:author')
  @ApiOperation({ summary: 'Create a storyboard (requires CREATOR licence)' })
  createStoryboard(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createStoryboard(user.tenantId, user.id, dto);
  }

  @Get('storyboards/:id')
  @RequirePermission('analytics:people:read')
  getStoryboard(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getStoryboard(user.tenantId, id);
  }

  @Put('storyboards/:id/slides')
  @RequirePermission('analytics:people:author')
  setSlides(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { slides: any[] }) {
    return this.service.setSlides(user.tenantId, user.id, id, body?.slides ?? []);
  }

  @Post('storyboards/:id/publish')
  @RequirePermission('analytics:people:author')
  publishStoryboard(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.publishStoryboard(user.tenantId, user.id, id);
  }

  @Post('storyboards/:id/unpublish')
  @RequirePermission('analytics:people:author')
  unpublishStoryboard(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.unpublishStoryboard(user.tenantId, user.id, id);
  }
}
