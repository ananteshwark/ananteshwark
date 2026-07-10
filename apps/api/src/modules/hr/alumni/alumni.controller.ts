import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AlumniService } from './alumni.service';
import { AlumniStatus, AlumniDocType, AlumniTicketCategory, AlumniTicketStatus } from './entities/alumni.entity';

@ApiTags('hr-alumni')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/alumni')
export class AlumniController {
  constructor(private readonly service: AlumniService) {}

  // ---- Profiles ----
  @Get('profiles')
  @RequirePermission('hr:alumni:manage')
  listProfiles(@CurrentUser() user: any, @Query('status') status?: AlumniStatus) {
    return this.service.listProfiles(user.tenantId, status);
  }

  @Post('profiles/invite')
  @RequirePermission('hr:alumni:manage')
  @ApiOperation({ summary: 'Invite a departing employee into the alumni network' })
  invite(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.invite(user.tenantId, dto);
  }

  @Get('profiles/:id')
  @RequirePermission('hr:alumni:read')
  getProfile(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getProfile(user.tenantId, id);
  }

  @Post('profiles/:id/activate')
  @RequirePermission('hr:alumni:manage')
  activate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activate(user.tenantId, id);
  }

  @Patch('profiles/:id')
  @RequirePermission('hr:alumni:read')
  @ApiOperation({ summary: 'Alumni self-service profile update' })
  updateProfile(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateProfile(user.tenantId, id, dto);
  }

  @Post('profiles/:id/deactivate')
  @RequirePermission('hr:alumni:manage')
  deactivate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deactivate(user.tenantId, id);
  }

  @Get('directory')
  @RequirePermission('hr:alumni:read')
  @ApiOperation({ summary: 'Opt-in alumni directory (searchable)' })
  directory(@CurrentUser() user: any, @Query('search') search?: string) {
    return this.service.directory(user.tenantId, search);
  }

  @Get('rehire-candidates')
  @RequirePermission('hr:alumni:manage')
  @ApiOperation({ summary: 'Rehire-eligible alumni open to returning (boomerang pool)' })
  rehireCandidates(@CurrentUser() user: any) {
    return this.service.rehireCandidates(user.tenantId);
  }

  // ---- Documents ----
  @Get('profiles/:id/documents')
  @RequirePermission('hr:alumni:read')
  listDocuments(@CurrentUser() user: any, @Param('id') id: string, @Query('docType') docType?: AlumniDocType) {
    return this.service.listDocuments(user.tenantId, id, docType);
  }

  @Post('profiles/:id/documents')
  @RequirePermission('hr:alumni:manage')
  addDocument(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addDocument(user.tenantId, id, dto);
  }

  // ---- Tickets ----
  @Get('tickets')
  @RequirePermission('hr:alumni:read')
  listTickets(@CurrentUser() user: any, @Query('profileId') profileId?: string, @Query('status') status?: AlumniTicketStatus) {
    return this.service.listTickets(user.tenantId, { profileId, status });
  }

  @Post('profiles/:id/tickets')
  @RequirePermission('hr:alumni:read')
  raiseTicket(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { category?: AlumniTicketCategory; subject: string; description?: string }) {
    return this.service.raiseTicket(user.tenantId, id, dto);
  }

  @Post('tickets/:ticketId/assign')
  @RequirePermission('hr:alumni:manage')
  assignTicket(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: { assignedToUserId?: string }) {
    return this.service.assignTicket(user.tenantId, ticketId, body?.assignedToUserId ?? user.id);
  }

  @Post('tickets/:ticketId/resolve')
  @RequirePermission('hr:alumni:manage')
  resolveTicket(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: { resolution: string }) {
    return this.service.resolveTicket(user.tenantId, ticketId, body?.resolution);
  }

  @Post('tickets/:ticketId/close')
  @RequirePermission('hr:alumni:manage')
  closeTicket(@CurrentUser() user: any, @Param('ticketId') ticketId: string) {
    return this.service.closeTicket(user.tenantId, ticketId);
  }
}
