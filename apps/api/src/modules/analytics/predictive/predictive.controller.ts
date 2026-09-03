import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PredictiveService } from './predictive.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PredictiveModel } from './entities/predictive-score.entity';

@ApiTags('analytics-predictive')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/predictive')
export class PredictiveController {
  constructor(private readonly service: PredictiveService) {}

  @Post('churn')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Score a customer churn risk' })
  churn(@CurrentUser() u: any, @Body() b: { customerId: string; signals: any }) { return this.service.scoreChurn(u.tenantId, b.customerId, b.signals ?? {}); }

  @Post('late-payment')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Score an invoice late-payment probability' })
  latePayment(@CurrentUser() u: any, @Body() b: { invoiceId: string; signals: any }) { return this.service.scoreLatePayment(u.tenantId, b.invoiceId, b.signals ?? {}); }

  @Post('demand-accuracy')
  @RequirePermission('analytics:read')
  @ApiOperation({ summary: 'Compute demand-forecast accuracy (MAPE) and bias' })
  demandAccuracy(@CurrentUser() _u: any, @Body() b: { series: any[] }) { return this.service.demandForecastAccuracy(b.series ?? []); }

  @Post('attrition/refresh')
  @RequirePermission('analytics:manage')
  @ApiOperation({ summary: 'Recompute attrition risk for all active employees' })
  refreshAttrition(@CurrentUser() user: any) {
    return this.service.scoreAttrition(user.tenantId);
  }

  @Get('top')
  @RequirePermission('analytics:read')
  @ApiQuery({ name: 'model', required: true, enum: PredictiveModel })
  @ApiQuery({ name: 'limit', required: false })
  top(@CurrentUser() u: any, @Query('model') model: PredictiveModel, @Query('limit') limit?: string) {
    return this.service.topRisks(u.tenantId, model, limit ? Number(limit) : 20);
  }

  @Get(':model/:subjectId')
  @RequirePermission('analytics:read')
  getScore(@CurrentUser() u: any, @Param('model') model: PredictiveModel, @Param('subjectId') subjectId: string) {
    return this.service.getScore(u.tenantId, model, subjectId);
  }
}
