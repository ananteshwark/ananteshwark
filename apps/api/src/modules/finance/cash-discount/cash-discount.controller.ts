import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CashDiscountService } from './cash-discount.service';
import {
  CreatePaymentTermDto,
  UpdatePaymentTermDto,
  ComputeDiscountDto,
} from './dto/cash-discount.dto';
import { CashDiscountType } from './entities/cash-discount.entity';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('finance/cash-discount')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CashDiscountController {
  constructor(private readonly svc: CashDiscountService) {}

  // ─── Payment Terms ────────────────────────────────────────────────────────────

  @Get('payment-terms')
  @RequirePermission('finance:read')
  getPaymentTerms(@CurrentUser() user: any, @Query('activeOnly') activeOnly?: string) {
    return this.svc.findPaymentTerms(user.tenantId, activeOnly === 'true');
  }

  @Get('payment-terms/:id')
  @RequirePermission('finance:read')
  getPaymentTerm(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findPaymentTerm(user.tenantId, id);
  }

  @Post('payment-terms')
  @RequirePermission('finance:write')
  createPaymentTerm(@CurrentUser() user: any, @Body() dto: CreatePaymentTermDto) {
    return this.svc.createPaymentTerm(user.tenantId, dto);
  }

  @Post('payment-terms/seed-defaults')
  @RequirePermission('finance:write')
  seedDefaults(@CurrentUser() user: any) {
    return this.svc.seedDefaults(user.tenantId);
  }

  @Patch('payment-terms/:id')
  @RequirePermission('finance:write')
  updatePaymentTerm(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentTermDto,
  ) {
    return this.svc.updatePaymentTerm(user.tenantId, id, dto);
  }

  @Delete('payment-terms/:id')
  @RequirePermission('finance:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePaymentTerm(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.deletePaymentTerm(user.tenantId, id);
  }

  // ─── Computation ──────────────────────────────────────────────────────────────

  @Post('compute')
  @RequirePermission('finance:read')
  compute(@CurrentUser() user: any, @Body() dto: ComputeDiscountDto) {
    return this.svc.computeByCode(
      user.tenantId,
      dto.termCode,
      dto.baseAmount,
      dto.baselineDate,
      dto.paymentDate,
    );
  }

  // ─── Realised Discounts + Report ──────────────────────────────────────────────

  @Get('records')
  @RequirePermission('finance:read')
  listDiscounts(
    @CurrentUser() user: any,
    @Query('type') type?: CashDiscountType,
    @Query('partyId') partyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listDiscounts(user.tenantId, { type, partyId, from, to });
  }

  @Get('utilization')
  @RequirePermission('finance:read')
  getUtilization(
    @CurrentUser() user: any,
    @Query('type') type?: CashDiscountType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getUtilizationReport(user.tenantId, { type, from, to });
  }
}
