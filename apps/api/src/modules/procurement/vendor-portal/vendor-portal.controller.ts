import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { VendorPortalService } from './vendor-portal.service';
import { VendorAuthGuard } from './guards/vendor-auth.guard';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  VendorLoginDto,
  EnablePortalDto,
  SubmitQuoteDto,
  PortalSubmitInvoiceDto,
} from './dto/vendor-portal.dto';

@ApiTags('vendor-portal')
@Controller('vendor-portal')
export class VendorPortalController {
  constructor(
    private readonly service: VendorPortalService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vendor portal login — returns vendor JWT' })
  async login(@Body() dto: VendorLoginDto) {
    const vendorInfo = await this.service.vendorLogin(dto.tenantId, dto.portalEmail, dto.password);
    const secret = this.configService.get<string>('JWT_SECRET', 'default-secret');
    const token = this.jwtService.sign(
      {
        type: 'vendor',
        vendorId: vendorInfo.vendorId,
        vendorName: vendorInfo.vendorName,
        tenantId: vendorInfo.tenantId,
      },
      { secret, expiresIn: '8h' },
    );
    return { accessToken: token, ...vendorInfo };
  }

  @Post('enable-access')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermission('procurement:po:approve')
  @ApiOperation({ summary: 'Enable vendor portal access (internal, requires JWT)' })
  enableAccess(@CurrentUser() user: any, @Body() dto: EnablePortalDto) {
    return this.service.enablePortalAccess(user.tenantId, dto.vendorId, dto.portalEmail, dto.password);
  }

  // ─── Vendor-authenticated endpoints ───────────────────────────

  @Get('rfqs')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'List RFQs for this vendor' })
  getMyRfqs(@Req() req: Request) {
    const vendor = (req as any).vendor;
    return this.service.getMyRfqs(vendor.tenantId, vendor.vendorId);
  }

  @Get('rfqs/:id')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'Get RFQ detail with vendor quotes' })
  getRfqDetail(@Req() req: Request, @Param('id') id: string) {
    const vendor = (req as any).vendor;
    return this.service.getRfqDetail(vendor.tenantId, id, vendor.vendorId);
  }

  @Post('rfqs/:id/quotes')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'Submit quotes for an RFQ' })
  submitQuote(@Req() req: Request, @Param('id') id: string, @Body() dto: SubmitQuoteDto) {
    const vendor = (req as any).vendor;
    return this.service.submitQuote(vendor.tenantId, id, vendor.vendorId, dto);
  }

  @Get('purchase-orders')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'List purchase orders for this vendor' })
  getMyPos(@Req() req: Request) {
    const vendor = (req as any).vendor;
    return this.service.getMyPurchaseOrders(vendor.tenantId, vendor.vendorId);
  }

  @Get('purchase-orders/:id')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'Get purchase order detail' })
  getPoDetail(@Req() req: Request, @Param('id') id: string) {
    const vendor = (req as any).vendor;
    return this.service.getPurchaseOrderDetail(vendor.tenantId, id, vendor.vendorId);
  }

  @Post('invoices')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'Submit an invoice via vendor portal' })
  submitInvoice(@Req() req: Request, @Body() dto: PortalSubmitInvoiceDto) {
    const vendor = (req as any).vendor;
    return this.service.submitInvoice(vendor.tenantId, vendor.vendorId, dto);
  }

  @Get('invoices')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: "List this vendor's invoices" })
  getMyInvoices(@Req() req: Request) {
    const vendor = (req as any).vendor;
    return this.service.getMyInvoices(vendor.tenantId, vendor.vendorId);
  }

  @Get('invoices/:id')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: 'Get invoice detail' })
  getInvoiceDetail(@Req() req: Request, @Param('id') id: string) {
    const vendor = (req as any).vendor;
    return this.service.vendorInvoiceDetail(vendor.tenantId, id, vendor.vendorId);
  }

  @Get('payments')
  @UseGuards(VendorAuthGuard)
  @ApiOperation({ summary: "List this vendor's payments" })
  getMyPayments(@Req() req: Request) {
    const vendor = (req as any).vendor;
    return this.service.getMyPayments(vendor.tenantId, vendor.vendorId);
  }
}
