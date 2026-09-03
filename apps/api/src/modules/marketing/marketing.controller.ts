import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('marketing')
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  // ─── Ph-233: campaigns ────────────────────────────────────────────
  @Get('campaigns')
  @RequirePermission('crm:read')
  listCampaigns(@CurrentUser() u: any) { return this.service.listCampaigns(u.tenantId); }

  @Post('campaigns')
  @RequirePermission('crm:manage')
  createCampaign(@CurrentUser() u: any, @Body() b: any) { return this.service.createCampaign(u.tenantId, b); }

  @Patch('campaigns/:id')
  @RequirePermission('crm:manage')
  updateCampaign(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateCampaign(u.tenantId, id, b); }

  @Post('campaigns/:id/members')
  @RequirePermission('crm:manage')
  addMembers(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { leadIds: string[] }) { return this.service.addMembers(u.tenantId, id, b.leadIds); }

  @Post('campaigns/:id/schedule')
  @RequirePermission('crm:manage')
  schedule(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { scheduledAt: string }) { return this.service.scheduleCampaign(u.tenantId, id, b.scheduledAt); }

  @Post('campaigns/:id/send')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Send a campaign to its members' })
  send(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { sentAt: string }) { return this.service.sendCampaign(u.tenantId, id, b.sentAt); }

  @Post('members/:id/engagement')
  @RequirePermission('crm:manage')
  engagement(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { event: 'OPEN' | 'CLICK' | 'BOUNCE' }) { return this.service.recordEngagement(u.tenantId, id, b.event); }

  @Get('campaigns/:id/stats')
  @RequirePermission('crm:read')
  stats(@CurrentUser() u: any, @Param('id') id: string) { return this.service.campaignStats(u.tenantId, id); }

  // ─── Ph-234: lead scoring ─────────────────────────────────────────
  @Post('leads/behavior')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Record a lead behavior (updates score)' })
  behavior(@CurrentUser() u: any, @Body() b: { leadId: string; behavior: string; at: string }) { return this.service.recordBehavior(u.tenantId, b.leadId, b.behavior, b.at); }

  @Get('leads/:leadId/score')
  @RequirePermission('crm:read')
  score(@CurrentUser() u: any, @Param('leadId') leadId: string) { return this.service.getScore(u.tenantId, leadId); }

  @Get('leads/top')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'limit', required: false })
  topLeads(@CurrentUser() u: any, @Query('limit') limit?: string) { return this.service.topLeads(u.tenantId, limit ? Number(limit) : 20); }

  // ─── Ph-235: nurture flows ────────────────────────────────────────
  @Get('nurture-flows')
  @RequirePermission('crm:read')
  listFlows(@CurrentUser() u: any) { return this.service.listFlows(u.tenantId); }

  @Post('nurture-flows')
  @RequirePermission('crm:manage')
  createFlow(@CurrentUser() u: any, @Body() b: any) { return this.service.createFlow(u.tenantId, b); }

  @Post('nurture-flows/trigger')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Trigger nurture flows for a behavior; returns scheduled steps' })
  trigger(@CurrentUser() u: any, @Body() b: { behavior: string; leadId: string; startDate: string }) { return this.service.triggerFlows(u.tenantId, b.behavior, b.leadId, b.startDate); }

  // ─── Ph-236: attribution ──────────────────────────────────────────
  @Post('members/:id/conversion')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Attribute a converted opportunity to a campaign member' })
  conversion(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { opportunityId: string; value: number }) { return this.service.recordConversion(u.tenantId, id, b.opportunityId, b.value); }

  @Get('campaigns/:id/roi')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Campaign ROI and attribution' })
  roi(@CurrentUser() u: any, @Param('id') id: string) { return this.service.campaignRoi(u.tenantId, id); }
}
