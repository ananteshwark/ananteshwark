import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { IntegrationsService } from './integrations.service';

@ApiTags('studio-integrations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('studio/integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  // ---- Scripts ----
  @Get('scripts')
  @RequirePermission('studio:integrations:read')
  listScripts(@CurrentUser() user: any) {
    return this.service.listScripts(user.tenantId);
  }

  @Post('scripts')
  @RequirePermission('studio:integrations:manage')
  createScript(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createScript(user.tenantId, dto);
  }

  @Post('scripts/:key/run')
  @RequirePermission('studio:integrations:manage')
  @ApiOperation({ summary: 'Run a script over supplied rows (safe declarative pipeline)' })
  runScript(@CurrentUser() user: any, @Param('key') key: string, @Body() body: { rows: any[] }) {
    return this.service.runScript(user.tenantId, key, body?.rows ?? []);
  }

  // ---- Scheduled jobs ----
  @Get('jobs')
  @RequirePermission('studio:integrations:read')
  listJobs(@CurrentUser() user: any) {
    return this.service.listJobs(user.tenantId);
  }

  @Post('jobs')
  @RequirePermission('studio:integrations:manage')
  createJob(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createJob(user.tenantId, dto);
  }

  @Post('jobs/:id/run')
  @RequirePermission('studio:integrations:manage')
  @ApiOperation({ summary: 'Run a scheduled job now (executes script + delivery seam)' })
  runJob(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { rows?: any[] }) {
    return this.service.runJob(user.tenantId, id, body?.rows ?? [], new Date());
  }

  // ---- API definitions ----
  @Get('apis')
  @RequirePermission('studio:integrations:read')
  listApis(@CurrentUser() user: any) {
    return this.service.listApiDefinitions(user.tenantId);
  }

  @Post('apis')
  @RequirePermission('studio:integrations:manage')
  createApi(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createApiDefinition(user.tenantId, dto);
  }

  @Post('apis/:path/resolve')
  @RequirePermission('studio:integrations:read')
  @ApiOperation({ summary: 'Resolve a defined API to its data' })
  resolveApi(@CurrentUser() user: any, @Param('path') path: string, @Body() body: { rows?: any[] }) {
    return this.service.resolveApi(user.tenantId, path, body?.rows ?? []);
  }
}
