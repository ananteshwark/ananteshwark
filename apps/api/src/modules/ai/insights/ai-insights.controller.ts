import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AiInsightsService, MeritLineSignal, DemandSlot, ScheduledSlot } from './ai-insights.service';

@ApiTags('ai-insights')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('ai/insights')
export class AiInsightsController {
  constructor(private readonly service: AiInsightsService) {}

  // ---- Merit-cycle insights ----
  @Post('merit/outliers')
  @RequirePermission('ai:insights:read')
  @ApiOperation({ summary: 'Flag statistical outlier increments within rating peer groups' })
  meritOutliers(@Body() body: { lines: MeritLineSignal[]; zThreshold?: number }) {
    return this.service.meritOutliers(body?.lines ?? [], body?.zThreshold);
  }

  @Post('merit/bias-alerts')
  @RequirePermission('ai:insights:read')
  @ApiOperation({ summary: 'Demographic pay-equity gap alerts per rating' })
  biasAlerts(@Body() body: { lines: MeritLineSignal[]; thresholdPct?: number }) {
    return this.service.biasAlerts(body?.lines ?? [], body?.thresholdPct);
  }

  @Post('merit/distribution')
  @RequirePermission('ai:insights:read')
  distribution(@Body() body: { lines: MeritLineSignal[] }) {
    return this.service.distribution(body?.lines ?? []);
  }

  // ---- WFM recommendations ----
  @Post('wfm/staffing')
  @RequirePermission('ai:insights:read')
  @ApiOperation({ summary: 'Per-slot understaffing/overstaffing recommendations vs demand' })
  staffing(@Body() body: { demand: DemandSlot[]; scheduled: ScheduledSlot[] }) {
    return this.service.staffingRecommendations(body?.demand ?? [], body?.scheduled ?? []);
  }

  @Post('wfm/overtime-risk')
  @RequirePermission('ai:insights:read')
  @ApiOperation({ summary: 'Employees projected over the weekly hours threshold' })
  overtime(@Body() body: { assignments: Array<{ employeeId: string; hours: number }>; weeklyThreshold?: number }) {
    return this.service.overtimeRisk(body?.assignments ?? [], body?.weeklyThreshold);
  }
}
