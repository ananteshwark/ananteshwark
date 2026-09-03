import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { AutomationSchedulerService } from './automation-scheduler.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('automation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('automation')
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly scheduler: AutomationSchedulerService,
  ) {}

  @Get('events')
  @RequirePermission('automation:rules:read')
  @ApiOperation({ summary: 'Catalog of automation trigger events' })
  listEvents() {
    return this.automationService.listEvents();
  }

  @Get('rules')
  @RequirePermission('automation:rules:read')
  listRules(@CurrentUser() user: any) {
    return this.automationService.listRules(user.tenantId);
  }

  @Post('rules')
  @RequirePermission('automation:rules:manage')
  createRule(@CurrentUser() user: any, @Body() dto: any) {
    return this.automationService.createRule(user.tenantId, dto);
  }

  @Patch('rules/:id')
  @RequirePermission('automation:rules:manage')
  updateRule(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.automationService.updateRule(user.tenantId, id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('automation:rules:manage')
  deleteRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.automationService.deleteRule(user.tenantId, id);
  }

  @Post('rules/:id/test')
  @RequirePermission('automation:rules:manage')
  @ApiOperation({ summary: 'Fire a rule once with a sample payload' })
  testRule(@CurrentUser() user: any, @Param('id') id: string, @Body() payload: any) {
    return this.automationService.testRule(user.tenantId, id, payload ?? {});
  }

  @Get('runs')
  @RequirePermission('automation:rules:read')
  listRuns(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.automationService.listRuns(user.tenantId, limit ? parseInt(limit, 10) : 50);
  }

  @Post('sweep')
  @RequirePermission('automation:rules:manage')
  @ApiOperation({ summary: 'Run the scheduled sweeps (overdue AR, SLA breaches, expiring contracts) now' })
  sweepNow() {
    return this.scheduler.sweepNow();
  }
}
