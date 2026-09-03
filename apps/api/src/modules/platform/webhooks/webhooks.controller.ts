import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import {
  CreateWebhookSubscriptionDto,
  UpdateWebhookSubscriptionDto,
} from './dto/webhooks.dto';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('platform/webhooks')
export class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Get('events')
  @RequirePermission('platform.webhooks.read')
  listEventTypes() {
    return this.svc.listEventTypes();
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────

  @Get('subscriptions')
  @RequirePermission('platform.webhooks.read')
  list(@CurrentUser() user: { tenantId: string }) {
    return this.svc.listSubscriptions(user.tenantId);
  }

  @Post('subscriptions')
  @RequirePermission('platform.webhooks.write')
  create(
    @CurrentUser() user: { tenantId: string },
    @Body() dto: CreateWebhookSubscriptionDto,
  ) {
    return this.svc.createSubscription(user.tenantId, dto);
  }

  @Get('subscriptions/:id')
  @RequirePermission('platform.webhooks.read')
  getOne(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getSubscription(user.tenantId, id);
  }

  @Patch('subscriptions/:id')
  @RequirePermission('platform.webhooks.write')
  update(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookSubscriptionDto,
  ) {
    return this.svc.updateSubscription(user.tenantId, id, dto);
  }

  @Post('subscriptions/:id/rotate-secret')
  @RequirePermission('platform.webhooks.write')
  rotateSecret(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.rotateSecret(user.tenantId, id);
  }

  @Post('subscriptions/:id/test')
  @RequirePermission('platform.webhooks.write')
  test(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.testSubscription(user.tenantId, id);
  }

  @Delete('subscriptions/:id')
  @RequirePermission('platform.webhooks.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.deleteSubscription(user.tenantId, id);
  }

  // ─── Deliveries ──────────────────────────────────────────────────────────────

  @Get('deliveries')
  @RequirePermission('platform.webhooks.read')
  listDeliveries(
    @CurrentUser() user: { tenantId: string },
    @Query('subscriptionId') subscriptionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.listDeliveries(
      user.tenantId,
      subscriptionId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('deliveries/:id')
  @RequirePermission('platform.webhooks.read')
  getDelivery(
    @CurrentUser() user: { tenantId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.svc.getDelivery(user.tenantId, id);
  }
}
