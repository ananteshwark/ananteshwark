import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PricingService, CalculatePriceInput } from './pricing.service';
import { CreditService } from './credit.service';
import { AtpService } from './atp.service';
import { PricingCondition } from './entities/pricing-condition.entity';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales')
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly credit: CreditService,
    private readonly atp: AtpService,
  ) {}

  // ---- Pricing Conditions ----
  @Get('pricing-conditions')
  @RequirePermission('sales:orders:read')
  listConditions(@CurrentUser() user: any) {
    return this.pricing.list(user.tenantId);
  }

  @Post('pricing-conditions')
  @RequirePermission('sales:orders:manage')
  createCondition(@CurrentUser() user: any, @Body() dto: Partial<PricingCondition>) {
    return this.pricing.create(user.tenantId, dto);
  }

  @Post('pricing-conditions/preview')
  @RequirePermission('sales:orders:read')
  previewPrice(@CurrentUser() user: any, @Body() dto: CalculatePriceInput) {
    return this.pricing.calculatePrice(user.tenantId, dto);
  }

  @Patch('pricing-conditions/:id')
  @RequirePermission('sales:orders:manage')
  updateCondition(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: Partial<PricingCondition>) {
    return this.pricing.update(user.tenantId, id, dto);
  }

  @Delete('pricing-conditions/:id')
  @RequirePermission('sales:orders:manage')
  deleteCondition(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pricing.remove(user.tenantId, id);
  }

  // ---- Credit Management ----
  @Get('customers/credit-report')
  @RequirePermission('sales:orders:read')
  creditReport(@CurrentUser() user: any) {
    return this.credit.getCreditReport(user.tenantId);
  }

  @Patch('customers/:id/credit-settings')
  @RequirePermission('sales:orders:manage')
  updateCreditSettings(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { creditLimit?: number; creditRating?: string | null; creditCheckMode?: string },
  ) {
    return this.credit.updateCreditSettings(user.tenantId, id, dto);
  }

  @Post('customers/:id/recalculate-exposure')
  @RequirePermission('sales:orders:manage')
  async recalcExposure(@CurrentUser() user: any, @Param('id') id: string) {
    const exposure = await this.credit.updateExposure(user.tenantId, id);
    return { customerId: id, creditExposure: exposure };
  }

  // ---- ATP ----
  @Post('atp/check')
  @RequirePermission('sales:orders:read')
  checkAtp(
    @CurrentUser() user: any,
    @Body() dto: { itemId: string; warehouseId?: string; requestedQty: number; requiredDate?: string },
  ) {
    return this.atp.checkATP(user.tenantId, dto.itemId, dto.warehouseId, dto.requestedQty, dto.requiredDate);
  }

  @Get('atp/dashboard')
  @RequirePermission('sales:orders:read')
  atpDashboard(@CurrentUser() user: any) {
    return this.atp.getATPDashboard(user.tenantId);
  }
}
