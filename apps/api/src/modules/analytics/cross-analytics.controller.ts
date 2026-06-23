import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CrossAnalyticsService } from './cross-analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('analytics/cross')
export class CrossAnalyticsController {
  constructor(private readonly svc: CrossAnalyticsService) {}

  @Get('summary')
  @RequirePermission('analytics:read')
  summary(@CurrentUser() u: any) {
    return this.svc.summary(u.tenantId);
  }

  @Get('hire-to-retire')
  @RequirePermission('analytics:read')
  hireToRetire(@CurrentUser() u: any) {
    return this.svc.hireToRetire(u.tenantId);
  }

  @Get('procure-to-pay')
  @RequirePermission('analytics:read')
  procureToPay(@CurrentUser() u: any) {
    return this.svc.procureToPay(u.tenantId);
  }

  @Get('order-to-cash')
  @RequirePermission('analytics:read')
  orderToCash(@CurrentUser() u: any) {
    return this.svc.orderToCash(u.tenantId);
  }

  @Get('finance-ratios')
  @RequirePermission('analytics:read')
  financeRatios(@CurrentUser() u: any) {
    return this.svc.financeRatios(u.tenantId);
  }
}
