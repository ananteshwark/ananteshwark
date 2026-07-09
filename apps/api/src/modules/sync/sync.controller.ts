import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SyncService, SyncMutationInput } from './sync.service';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly service: SyncService) {}

  @Get('coverage')
  @RequirePermission('mobile:sync')
  @ApiOperation({ summary: 'Datasets and mutation types this deployment can sync' })
  coverage() {
    return this.service.coverage();
  }

  @Get('pull')
  @RequirePermission('mobile:sync')
  @ApiOperation({ summary: 'Delta pull: my rows changed since the cursor, plus a new cursor' })
  pull(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('datasets') datasets?: string,
  ) {
    const keys = datasets ? datasets.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    return this.service.pull(user.tenantId, user.id, { cursor, datasets: keys });
  }

  @Post('push')
  @RequirePermission('mobile:sync')
  @ApiOperation({ summary: 'Replay the offline outbox: typed mutations applied exactly once per device' })
  push(
    @CurrentUser() user: any,
    @Body() body: { deviceId: string; mutations: SyncMutationInput[] },
  ) {
    return this.service.push(user.tenantId, user.id, body?.deviceId, body?.mutations ?? []);
  }
}
