import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RecruitingConnectorsService } from './recruiting-connectors.service';
import { ConnectorType, AssessmentStatus } from './entities/connector.entity';

@ApiTags('recruiting-connectors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('recruiting/connectors')
export class RecruitingConnectorsController {
  constructor(private readonly service: RecruitingConnectorsService) {}

  // ---- Connector registry ----
  @Get()
  @RequirePermission('recruiting:connectors:read')
  list(@CurrentUser() user: any, @Query('type') type?: ConnectorType) {
    return this.service.listConnectors(user.tenantId, type);
  }

  @Post()
  @RequirePermission('recruiting:connectors:manage')
  register(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.registerConnector(user.tenantId, dto);
  }

  @Patch(':id/enabled')
  @RequirePermission('recruiting:connectors:manage')
  setEnabled(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.service.setEnabled(user.tenantId, id, !!body?.enabled);
  }

  // ---- Job publishing ----
  @Get('publications')
  @RequirePermission('recruiting:connectors:read')
  listPublications(@CurrentUser() user: any, @Query('jobId') jobId?: string) {
    return this.service.listPublications(user.tenantId, jobId);
  }

  @Post('publish')
  @RequirePermission('recruiting:connectors:publish')
  @ApiOperation({ summary: 'Publish a job to an external board via a connector' })
  publish(@CurrentUser() user: any, @Body() dto: { jobId: string; connectorId: string; title?: string }) {
    return this.service.publishJob(user.tenantId, dto);
  }

  @Post('publications/:id/close')
  @RequirePermission('recruiting:connectors:publish')
  closePublication(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.closePublication(user.tenantId, id);
  }

  // ---- Assessments ----
  @Get('assessments')
  @RequirePermission('recruiting:connectors:read')
  listAssessments(@CurrentUser() user: any, @Query('candidateId') candidateId?: string) {
    return this.service.listAssessmentOrders(user.tenantId, candidateId);
  }

  @Post('assessments/order')
  @RequirePermission('recruiting:connectors:publish')
  orderAssessment(@CurrentUser() user: any, @Body() dto: { candidateId: string; connectorId: string; assessmentKey?: string }) {
    return this.service.orderAssessment(user.tenantId, dto);
  }

  @Post('assessments/ingest')
  @RequirePermission('recruiting:connectors:manage')
  @ApiOperation({ summary: 'Ingest an assessment result (vendor webhook) matched by external ref' })
  ingestResult(@CurrentUser() user: any, @Body() dto: { externalRef: string; status?: AssessmentStatus; score?: number; resultUrl?: string }) {
    return this.service.ingestAssessmentResult(user.tenantId, dto);
  }

  // ---- Calendar ----
  @Post('calendar/schedule')
  @RequirePermission('recruiting:connectors:publish')
  @ApiOperation({ summary: 'Create an interview event on an external calendar via a connector' })
  schedule(@CurrentUser() user: any, @Body() dto: { connectorId: string; summary: string; start: string; end: string; attendees?: string[] }) {
    return this.service.scheduleEvent(user.tenantId, dto);
  }
}
