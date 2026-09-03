import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IntegrationService } from './integration.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EventStatus } from './entities/integration-event.entity';

@ApiTags('integration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('integration')
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  // ─── Ph-277/278: adapters ─────────────────────────────────────────
  @Get('adapters')
  @RequirePermission('admin:read')
  listAdapters(@CurrentUser() u: any) { return this.service.listAdapters(u.tenantId); }

  @Post('adapters')
  @RequirePermission('admin:manage')
  createAdapter(@CurrentUser() u: any, @Body() b: any) { return this.service.createAdapter(u.tenantId, b); }

  @Get('connectors')
  @RequirePermission('admin:read')
  connectors() { return this.service.listConnectorTemplates(); }

  @Post('adapters/from-connector')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Instantiate an adapter from a pre-built connector' })
  fromConnector(@CurrentUser() u: any, @Body() b: { connectorKey: string; code: string; config?: any }) {
    return this.service.createFromConnector(u.tenantId, b.connectorKey, b.code, b.config ?? {});
  }

  // ─── Ph-279: events ───────────────────────────────────────────────
  @Post('events')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Publish an outbound integration event' })
  publish(@CurrentUser() u: any, @Body() b: { adapterId: string; eventType: string; payload?: any }) {
    return this.service.publishEvent(u.tenantId, b.adapterId, b.eventType, b.payload ?? {});
  }

  @Post('events/:id/deliver')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Attempt delivery (success simulates downstream)' })
  deliver(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { success: boolean; at: string; error?: string }) {
    return this.service.attemptDelivery(u.tenantId, id, b.success, b.at, b.error);
  }

  @Post('events/:id/replay')
  @RequirePermission('admin:manage')
  replay(@CurrentUser() u: any, @Param('id') id: string) { return this.service.replayDeadLetter(u.tenantId, id); }

  @Get('events')
  @RequirePermission('admin:read')
  @ApiQuery({ name: 'adapterId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listEvents(@CurrentUser() u: any, @Query('adapterId') adapterId?: string, @Query('status') status?: EventStatus) {
    return this.service.listEvents(u.tenantId, adapterId, status);
  }

  // ─── Ph-280: monitoring ───────────────────────────────────────────
  @Get('monitoring')
  @RequirePermission('admin:read')
  @ApiOperation({ summary: 'Per-adapter success/failure + dead-letter queue' })
  monitoring(@CurrentUser() u: any) { return this.service.monitoring(u.tenantId); }
}
