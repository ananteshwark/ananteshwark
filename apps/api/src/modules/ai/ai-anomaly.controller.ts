import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiAnomalyService } from './ai-anomaly.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/anomalies')
export class AiAnomalyController {
  constructor(private readonly service: AiAnomalyService) {}

  @Get()
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Cross-module anomaly scan (optionally ?modules=expenses,finance)' })
  scan(@CurrentUser() user: any, @Query('modules') modules?: string) {
    const filter = modules ? modules.split(',').map((m) => m.trim()).filter(Boolean) : undefined;
    return this.service.scan(user.tenantId, filter);
  }

  @Post('scan-async')
  @RequirePermission('analytics:manage')
  @ApiOperation({ summary: 'Queue a durable background scan; findings emit anomaly.detected' })
  scheduleScan(@CurrentUser() user: any) {
    return this.service.scheduleScan(user.tenantId);
  }

  @Get('coverage')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Which modules and checks the AI anomaly layer covers' })
  coverage() {
    return this.service.coverage();
  }
}
