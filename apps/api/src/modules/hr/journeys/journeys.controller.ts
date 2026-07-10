import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JourneysService } from './journeys.service';
import { JourneyTrigger, JourneyStatus } from './entities/journey.entity';

@ApiTags('hr-journeys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('hr/journeys')
export class JourneysController {
  constructor(private readonly service: JourneysService) {}

  // ---- Templates ----
  @Get('templates')
  @RequirePermission('hr:journeys:read')
  listTemplates(@CurrentUser() user: any, @Query('triggerEvent') triggerEvent?: JourneyTrigger) {
    return this.service.listTemplates(user.tenantId, triggerEvent);
  }

  @Post('templates')
  @RequirePermission('hr:journeys:manage')
  createTemplate(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createTemplate(user.tenantId, dto);
  }

  @Patch('templates/:id')
  @RequirePermission('hr:journeys:manage')
  updateTemplate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateTemplate(user.tenantId, id, dto);
  }

  // ---- Triggering ----
  @Post('templates/:id/trigger')
  @RequirePermission('hr:journeys:manage')
  @ApiOperation({ summary: 'Instantiate a journey from a template for an employee' })
  triggerTemplate(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { employeeId: string; employeeName: string; anchorDate: string }) {
    return this.service.triggerTemplate(user.tenantId, id, dto);
  }

  @Post('trigger/:event')
  @RequirePermission('hr:journeys:manage')
  @ApiOperation({ summary: 'Fire all active templates registered for a lifecycle event' })
  triggerByEvent(@CurrentUser() user: any, @Param('event') event: JourneyTrigger, @Body() dto: { employeeId: string; employeeName: string; anchorDate: string }) {
    return this.service.triggerByEvent(user.tenantId, event, dto);
  }

  // ---- Instances & steps ----
  @Get('instances')
  @RequirePermission('hr:journeys:read')
  listInstances(@CurrentUser() user: any, @Query('employeeId') employeeId?: string, @Query('status') status?: JourneyStatus) {
    return this.service.listInstances(user.tenantId, { employeeId, status });
  }

  @Get('instances/:id')
  @RequirePermission('hr:journeys:read')
  getInstance(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getInstance(user.tenantId, id);
  }

  @Post('instances/:id/cancel')
  @RequirePermission('hr:journeys:manage')
  cancelInstance(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelInstance(user.tenantId, id);
  }

  @Post('steps/:stepId/complete')
  @RequirePermission('hr:journeys:read')
  completeStep(@CurrentUser() user: any, @Param('stepId') stepId: string) {
    return this.service.completeStep(user.tenantId, stepId, user.id);
  }

  @Post('steps/:stepId/skip')
  @RequirePermission('hr:journeys:manage')
  skipStep(@CurrentUser() user: any, @Param('stepId') stepId: string) {
    return this.service.skipStep(user.tenantId, stepId);
  }

  @Get('overdue')
  @RequirePermission('hr:journeys:read')
  overdue(@CurrentUser() user: any, @Query('asOf') asOf: string) {
    return this.service.overdueSteps(user.tenantId, asOf);
  }
}
