import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CapitalService } from './capital.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('project-capital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('projects/capital')
export class CapitalController {
  constructor(private readonly service: CapitalService) {}

  // ─── Ph-248: config + rules ───────────────────────────────────────
  @Post(':projectId/config')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Set a project as capital with default treatment' })
  setConfig(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.setConfig(u.tenantId, { ...b, projectId });
  }

  @Get(':projectId/config')
  @RequirePermission('projects:read')
  getConfig(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.getConfig(u.tenantId, projectId); }

  @Post(':projectId/rules')
  @RequirePermission('projects:manage')
  setRule(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.setRule(u.tenantId, { ...b, projectId });
  }

  @Get(':projectId/rules')
  @RequirePermission('projects:read')
  listRules(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.listRules(u.tenantId, projectId); }

  // ─── Ph-249: CIP interface ────────────────────────────────────────
  @Post(':projectId/accumulate')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Accumulate a project cost (capitalize/expense)' })
  accumulate(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: any) {
    return this.service.accumulate(u.tenantId, { ...b, projectId });
  }

  @Get(':projectId/cip-summary')
  @RequirePermission('projects:read')
  cipSummary(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.cipSummary(u.tenantId, projectId); }

  @Get(':projectId/entries')
  @RequirePermission('projects:read')
  entries(@CurrentUser() u: any, @Param('projectId') projectId: string) { return this.service.listEntries(u.tenantId, projectId); }

  // ─── Ph-250: asset assignment ─────────────────────────────────────
  @Post(':projectId/transfer')
  @RequirePermission('projects:manage')
  @ApiOperation({ summary: 'Transfer CIP to in-service assets (split by %)' })
  transfer(@CurrentUser() u: any, @Param('projectId') projectId: string, @Body() b: { assets: any[] }) {
    return this.service.transferToInService(u.tenantId, projectId, b.assets);
  }
}
