import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ServiceDeskService } from './service-desk.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('crm-service-desk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm/service-desk')
export class ServiceDeskController {
  constructor(private readonly service: ServiceDeskService) {}

  // ─── Ph-229: knowledge base ───────────────────────────────────────
  @Post('articles')
  @RequirePermission('crm:manage')
  createArticle(@CurrentUser() u: any, @Body() b: any) { return this.service.createArticle(u.tenantId, b); }

  @Patch('articles/:id')
  @RequirePermission('crm:manage')
  updateArticle(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateArticle(u.tenantId, id, b); }

  @Post('articles/:id/publish')
  @RequirePermission('crm:manage')
  publish(@CurrentUser() u: any, @Param('id') id: string) { return this.service.publishArticle(u.tenantId, id); }

  @Post('articles/:id/rate')
  @RequirePermission('crm:read')
  rate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { helpful: boolean }) { return this.service.rateArticle(u.tenantId, id, b.helpful); }

  @Get('articles/search')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Search published KB articles' })
  @ApiQuery({ name: 'term', required: false })
  @ApiQuery({ name: 'publicOnly', required: false })
  search(@CurrentUser() u: any, @Query('term') term?: string, @Query('publicOnly') publicOnly?: string) {
    return this.service.searchArticles(u.tenantId, term ?? '', publicOnly === 'true');
  }

  // ─── Ph-230: email-to-ticket ──────────────────────────────────────
  @Get('routing-rules')
  @RequirePermission('crm:read')
  listRules(@CurrentUser() u: any) { return this.service.listRules(u.tenantId); }

  @Post('routing-rules')
  @RequirePermission('crm:manage')
  createRule(@CurrentUser() u: any, @Body() b: any) { return this.service.createRule(u.tenantId, b); }

  @Post('email-to-ticket')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Create a ticket from an inbound email (keyword routing)' })
  emailToTicket(@CurrentUser() u: any, @Body() b: any) { return this.service.createTicketFromEmail(u.tenantId, b); }

  // ─── Ph-231: self-service portal ──────────────────────────────────
  @Get('portal/tickets')
  @RequirePermission('crm:read')
  @ApiQuery({ name: 'customerId', required: true })
  portalTickets(@CurrentUser() u: any, @Query('customerId') customerId: string) { return this.service.listCustomerTickets(u.tenantId, customerId); }

  @Post('portal/tickets')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Portal ticket creation with KB deflection' })
  portalCreate(@CurrentUser() u: any, @Body() b: any) { return this.service.portalCreateTicket(u.tenantId, b); }

  // ─── Ph-232: SLA escalation ───────────────────────────────────────
  @Get('sla/escalation-candidates')
  @RequirePermission('crm:read')
  @ApiOperation({ summary: 'Open tickets with imminent/breached SLA' })
  @ApiQuery({ name: 'now', required: true })
  @ApiQuery({ name: 'warnMinutes', required: false })
  escalationCandidates(@CurrentUser() u: any, @Query('now') now: string, @Query('warnMinutes') warnMinutes?: string) {
    return this.service.slaEscalationCandidates(u.tenantId, now, warnMinutes ? Number(warnMinutes) : 60);
  }

  @Post('tickets/:id/escalate')
  @RequirePermission('crm:manage')
  @ApiOperation({ summary: 'Escalate a ticket to a manager' })
  escalate(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { managerUserId: string }) {
    return this.service.escalateTicket(u.tenantId, id, b.managerUserId);
  }
}
