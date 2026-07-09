import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PeppolService } from './peppol.service';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('compliance/peppol')
export class PeppolController {
  constructor(private readonly service: PeppolService) {}

  @Get('invoices/:invoiceId/ubl')
  @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'Download an AR invoice as a PEPPOL BIS Billing 3.0 UBL document' })
  async ubl(
    @CurrentUser() user: any,
    @Param('invoiceId') invoiceId: string,
    @Res() res: Response,
    @Query('supplierName') supplierName?: string,
    @Query('supplierVat') supplierVat?: string,
    @Query('supplierCountry') supplierCountry?: string,
    @Query('supplierStreet') supplierStreet?: string,
    @Query('supplierCity') supplierCity?: string,
    @Query('supplierPostalZone') supplierPostalZone?: string,
  ) {
    const xml = await this.service.buildUblForInvoice(user.tenantId, invoiceId, {
      name: supplierName ?? '',
      vatId: supplierVat,
      countryCode: supplierCountry ?? '',
      street: supplierStreet,
      city: supplierCity,
      postalZone: supplierPostalZone,
    });
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="ubl-invoice-${invoiceId}.xml"`);
    res.send(xml);
  }
}
