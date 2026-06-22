import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceTicketService } from './service-ticket.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TicketPriority, TicketStatus } from './entities/service-ticket.entity';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm')
export class ServiceTicketController {
  constructor(private readonly service: ServiceTicketService) {}

  // ─── Tickets ──────────────────────────────────────────────────

  @Get('tickets')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'List service tickets' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @ApiQuery({ name: 'priority', required: false, enum: TicketPriority })
  @ApiQuery({ name: 'assignedToUserId', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  listTickets(
    @CurrentUser() user: any,
    @Query('status') status?: TicketStatus,
    @Query('priority') priority?: TicketPriority,
    @Query('assignedToUserId') assignedToUserId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.service.listTickets(user.tenantId, {
      status,
      priority,
      assignedToUserId,
      customerId,
    });
  }

  @Get('tickets/dashboard')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Service ticket dashboard metrics' })
  getDashboard(@CurrentUser() user: any) {
    return this.service.getDashboard(user.tenantId);
  }

  @Get('tickets/:id')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Get service ticket with comments' })
  getTicket(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getTicket(user.tenantId, id);
  }

  @Post('tickets')
  @RequirePermission('crm:contacts:create')
  @ApiOperation({ summary: 'Create service ticket' })
  createTicket(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createTicket(user.tenantId, dto);
  }

  @Patch('tickets/:id/status')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Update ticket status' })
  updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { status: TicketStatus },
  ) {
    return this.service.updateStatus(user.tenantId, id, dto.status);
  }

  @Post('tickets/:id/comments')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Add a comment to a ticket' })
  addComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { body: string; isInternal?: boolean },
  ) {
    return this.service.addComment(user.tenantId, id, user.id ?? user.userId ?? null, dto);
  }

  @Patch('tickets/:id/assign')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Assign ticket to a user' })
  assignTicket(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { assignedToUserId: string | null },
  ) {
    return this.service.assignTicket(user.tenantId, id, dto.assignedToUserId ?? null);
  }

  @Post('tickets/:id/csat')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Record CSAT score for a ticket' })
  setCsat(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { csatScore: number },
  ) {
    return this.service.setCsat(user.tenantId, id, dto.csatScore);
  }

  // ─── SLA policies ─────────────────────────────────────────────

  @Get('sla-policies')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'List SLA policies' })
  listSlaPolicies(@CurrentUser() user: any) {
    return this.service.listSlaPolicies(user.tenantId);
  }

  @Post('sla-policies')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Create or update an SLA policy' })
  saveSlaPolicy(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.saveSlaPolicy(user.tenantId, dto);
  }
}
