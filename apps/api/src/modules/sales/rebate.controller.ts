import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RebateService } from './rebate.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('sales-rebates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/rebates')
export class RebateController {
  constructor(private readonly service: RebateService) {}

  @Get()
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'List rebate agreements' })
  list(@CurrentUser() user: any) {
    return this.service.listAgreements(user.tenantId);
  }

  @Get(':id')
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'Get rebate agreement' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getAgreement(user.tenantId, id);
  }

  @Post()
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Create rebate agreement' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createAgreement(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Update rebate agreement' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateAgreement(user.tenantId, id, dto);
  }

  @Post(':id/accrue/:orderId')
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Accrue rebate for a sales order' })
  accrue(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    return this.service.accrueRebate(user.tenantId, orderId);
  }

  @Post(':id/simulate')
  @RequirePermission('sales:orders:read')
  @ApiOperation({ summary: 'Simulate rebate for an order value' })
  simulate(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { orderValue: number }) {
    return this.service.simulateRebate(user.tenantId, id, body.orderValue);
  }

  @Post(':id/settle')
  @RequirePermission('sales:orders:create')
  @ApiOperation({ summary: 'Settle rebate agreement (create credit note)' })
  settle(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.settleAgreement(user.tenantId, id);
  }
}
