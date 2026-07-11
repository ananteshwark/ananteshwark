import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ChannelDispatchService } from './channel-dispatch.service';
import { RewardStoreService } from './reward-store.service';
import { NotificationChannel } from './entities/channel.entity';
import { RedemptionStatus } from './entities/reward.entity';

@ApiTags('notification-channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('notifications/channels')
export class ChannelsController {
  constructor(
    private readonly dispatch: ChannelDispatchService,
    private readonly rewards: RewardStoreService,
  ) {}

  // ---- Channel subscriptions ----
  @Get('subscriptions')
  @RequirePermission('notifications:channels:read')
  listSubscriptions(@CurrentUser() user: any) {
    return this.dispatch.listSubscriptions(user.tenantId, user.id);
  }

  @Post('subscriptions')
  @RequirePermission('notifications:channels:read')
  @ApiOperation({ summary: 'Subscribe the current user to an external channel (Teams / Slack / web push / email)' })
  subscribe(@CurrentUser() user: any, @Body() dto: { channel: NotificationChannel; target: Record<string, any> }) {
    return this.dispatch.subscribe(user.tenantId, user.id, dto);
  }

  @Patch('subscriptions/:id/enabled')
  @RequirePermission('notifications:channels:read')
  setEnabled(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.dispatch.setEnabled(user.tenantId, id, !!body?.enabled);
  }

  @Post('dispatch')
  @RequirePermission('notifications:channels:manage')
  @ApiOperation({ summary: 'Dispatch a message to a user across their channels (via the channel seam)' })
  dispatchMessage(@CurrentUser() user: any, @Body() body: { userId: string; title: string; body: string; channels?: NotificationChannel[] }) {
    return this.dispatch.dispatch(user.tenantId, body.userId, { title: body.title, body: body.body, channels: body.channels });
  }

  @Get('deliveries')
  @RequirePermission('notifications:channels:read')
  deliveries(@CurrentUser() user: any) {
    return this.dispatch.listDeliveries(user.tenantId, user.id);
  }

  // ---- Reward store ----
  @Get('rewards')
  @RequirePermission('rewards:read')
  listRewards(@CurrentUser() user: any) {
    return this.rewards.listItems(user.tenantId);
  }

  @Post('rewards')
  @RequirePermission('rewards:manage')
  createReward(@CurrentUser() user: any, @Body() dto: any) {
    return this.rewards.createItem(user.tenantId, dto);
  }

  @Post('rewards/:id/redeem')
  @RequirePermission('rewards:redeem')
  @ApiOperation({ summary: 'Redeem a reward against an available point balance' })
  redeem(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { availablePoints: number }) {
    return this.rewards.redeem(user.tenantId, user.id, id, Number(body?.availablePoints ?? 0));
  }

  @Get('redemptions')
  @RequirePermission('rewards:manage')
  listRedemptions(@CurrentUser() user: any, @Query('userId') userId?: string, @Query('status') status?: RedemptionStatus) {
    return this.rewards.listRedemptions(user.tenantId, { userId, status });
  }

  @Patch('redemptions/:id/status')
  @RequirePermission('rewards:manage')
  setRedemptionStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: RedemptionStatus; fulfillmentRef?: string }) {
    return this.rewards.setRedemptionStatus(user.tenantId, id, body.status, body.fulfillmentRef);
  }
}
