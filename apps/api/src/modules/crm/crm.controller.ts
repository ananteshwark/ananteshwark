import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { OpportunityStage } from './entities/crm-opportunity.entity';

@ApiTags('crm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  // ─── Contacts ─────────────────────────────────────────────────

  @Get('contacts')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'List CRM contacts' })
  @ApiQuery({ name: 'search', required: false })
  listContacts(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.service.findContacts(user.tenantId, pagination, search);
  }

  @Get('contacts/:id')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Get contact by ID' })
  getContact(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findContact(user.tenantId, id);
  }

  @Post('contacts')
  @RequirePermission('crm:contacts:create')
  @ApiOperation({ summary: 'Create contact' })
  createContact(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createContact(user.tenantId, dto);
  }

  @Patch('contacts/:id')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Update contact' })
  updateContact(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateContact(user.tenantId, id, dto);
  }

  @Delete('contacts/:id')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Delete contact' })
  deleteContact(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteContact(user.tenantId, id);
  }

  // ─── Opportunities ────────────────────────────────────────────

  @Get('opportunities')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'List opportunities' })
  @ApiQuery({ name: 'stage', required: false, enum: OpportunityStage })
  @ApiQuery({ name: 'ownerId', required: false })
  listOpportunities(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('stage') stage?: OpportunityStage,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findOpportunities(user.tenantId, pagination, { stage, ownerId });
  }

  @Get('opportunities/:id')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'Get opportunity by ID' })
  getOpportunity(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOpportunity(user.tenantId, id);
  }

  @Post('opportunities')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'Create opportunity' })
  createOpportunity(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createOpportunity(user.tenantId, dto);
  }

  @Patch('opportunities/:id')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'Update opportunity' })
  updateOpportunity(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateOpportunity(user.tenantId, id, dto);
  }

  @Delete('opportunities/:id')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'Delete opportunity' })
  deleteOpportunity(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteOpportunity(user.tenantId, id);
  }

  // ─── Activities ───────────────────────────────────────────────

  @Get('activities')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'List CRM activities' })
  @ApiQuery({ name: 'contactId', required: false })
  @ApiQuery({ name: 'opportunityId', required: false })
  listActivities(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('contactId') contactId?: string,
    @Query('opportunityId') opportunityId?: string,
  ) {
    return this.service.findActivities(user.tenantId, pagination, { contactId, opportunityId });
  }

  @Get('activities/:id')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Get activity by ID' })
  getActivity(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findActivity(user.tenantId, id);
  }

  @Post('activities')
  @RequirePermission('crm:contacts:create')
  @ApiOperation({ summary: 'Log CRM activity' })
  createActivity(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createActivity(user.tenantId, user.id, dto);
  }

  @Patch('activities/:id')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Update CRM activity' })
  updateActivity(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateActivity(user.tenantId, id, dto);
  }

  @Delete('activities/:id')
  @RequirePermission('crm:contacts:update')
  @ApiOperation({ summary: 'Delete CRM activity' })
  deleteActivity(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteActivity(user.tenantId, id);
  }

  // ─── Quotes ───────────────────────────────────────────────────

  @Get('quotes')
  @RequirePermission('crm:quotes:manage')
  @ApiOperation({ summary: 'List CRM quotes' })
  listQuotes(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findQuotes(user.tenantId, pagination);
  }

  @Get('quotes/:id')
  @RequirePermission('crm:quotes:manage')
  @ApiOperation({ summary: 'Get quote by ID' })
  getQuote(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findQuote(user.tenantId, id);
  }

  @Post('quotes')
  @RequirePermission('crm:quotes:manage')
  @ApiOperation({ summary: 'Create CRM quote' })
  createQuote(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createQuote(user.tenantId, dto);
  }

  @Patch('quotes/:id')
  @RequirePermission('crm:quotes:manage')
  @ApiOperation({ summary: 'Update CRM quote' })
  updateQuote(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateQuote(user.tenantId, id, dto);
  }

  @Delete('quotes/:id')
  @RequirePermission('crm:quotes:manage')
  @ApiOperation({ summary: 'Delete CRM quote' })
  deleteQuote(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteQuote(user.tenantId, id);
  }

  // ─── Analytics ────────────────────────────────────────────────

  @Get('pipeline')
  @RequirePermission('crm:opportunities:manage')
  @ApiOperation({ summary: 'Get sales pipeline grouped by stage' })
  getSalesPipeline(@CurrentUser() user: any) {
    return this.service.getSalesPipeline(user.tenantId);
  }

  @Get('funnel')
  @RequirePermission('crm:contacts:read')
  @ApiOperation({ summary: 'Get conversion funnel for date range' })
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  getConversionFunnel(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getConversionFunnel(user.tenantId, from, to);
  }
}
