import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BillingPlansService } from './billing-plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sales-billing-plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/billing-plans')
export class BillingPlansController {
  constructor(private readonly service: BillingPlansService) {}

  @Get()
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'List all billing plans' })
  list(@CurrentUser() user: any) {
    return this.service.listBillingPlans(user.tenantId);
  }

  @Get('upcoming')
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'Get upcoming billings within N days' })
  upcoming(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.service.getUpcomingBillings(user.tenantId, days ? Number(days) : 30);
  }

  @Get('by-order/:orderId')
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'Get billing plan for a sales order' })
  byOrder(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    return this.service.getBillingPlan(user.tenantId, orderId);
  }

  @Get(':id')
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'Get billing plan by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getBillingPlanById(user.tenantId, id);
  }

  @Post()
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Create billing plan for a sales order' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createBillingPlan(user.tenantId, dto);
  }

  @Post(':id/milestones/:num/bill')
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Mark milestone as billed' })
  billMilestone(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('num') num: string,
    @Body() body: { invoiceId?: string },
  ) {
    return this.service.billMilestone(user.tenantId, id, Number(num), body?.invoiceId);
  }

  @Post(':id/milestones/:num/paid')
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Mark milestone as paid' })
  markPaid(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('num') num: string,
  ) {
    return this.service.markMilestonePaid(user.tenantId, id, Number(num));
  }
}
