import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GstService, SellerDetails } from './gst.service';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('compliance/gst')
export class GstController {
  constructor(private readonly service: GstService) {}

  @Post('einvoices')
  @RequirePermission('finance:tax:manage')
  @ApiOperation({ summary: 'Generate an IRN + INV-01 payload for an AR invoice' })
  generate(@CurrentUser() user: any, @Body() dto: { invoiceId: string; seller: SellerDetails }) {
    return this.service.generateEInvoice(user.tenantId, dto.invoiceId, dto.seller);
  }

  @Get('einvoices')
  @RequirePermission('finance:tax:read')
  list(@CurrentUser() user: any) {
    return this.service.listEInvoices(user.tenantId);
  }

  @Post('einvoices/:id/cancel')
  @RequirePermission('finance:tax:manage')
  cancel(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.service.cancelEInvoice(user.tenantId, id, body?.reason);
  }

  @Get('gstr1')
  @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'GSTR-1 outward supply summary for a return period' })
  gstr1(@CurrentUser() user: any, @Query('from') from: string, @Query('to') to: string) {
    return this.service.gstr1Summary(user.tenantId, from, to);
  }

  @Get('gstr3b')
  @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'GSTR-3B liability vs input tax credit summary' })
  gstr3b(@CurrentUser() user: any, @Query('from') from: string, @Query('to') to: string) {
    return this.service.gstr3bSummary(user.tenantId, from, to);
  }
}
