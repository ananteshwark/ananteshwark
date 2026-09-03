import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ConfigSyncService } from './config-sync.service';

@ApiTags('platform-config-sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/config-sync')
export class ConfigSyncController {
  constructor(private readonly service: ConfigSyncService) {}

  @Get('snapshots')
  @RequirePermission('platform:config:read')
  list(@CurrentUser() user: any, @Query('environment') environment?: string) {
    return this.service.listSnapshots(user.tenantId, environment);
  }

  @Post('snapshots')
  @RequirePermission('platform:config:manage')
  @ApiOperation({ summary: 'Capture a configuration snapshot for an environment' })
  capture(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.capture(user.tenantId, { ...dto, createdByUserId: user.id });
  }

  @Get('snapshots/:id')
  @RequirePermission('platform:config:read')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getSnapshot(user.tenantId, id);
  }

  @Get('diff')
  @RequirePermission('platform:config:read')
  @ApiOperation({ summary: 'Key-level diff between two snapshots' })
  diff(@CurrentUser() user: any, @Query('baseId') baseId: string, @Query('targetId') targetId: string) {
    return this.service.diffSnapshots(user.tenantId, baseId, targetId);
  }

  @Post('snapshots/:id/promote')
  @RequirePermission('platform:config:manage')
  @ApiOperation({ summary: 'Promote selected keys from a snapshot onto a base config map' })
  promote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { base: Record<string, any>; keys?: string[] }) {
    return this.service.promoteSnapshot(user.tenantId, id, body?.base ?? {}, body?.keys);
  }
}
