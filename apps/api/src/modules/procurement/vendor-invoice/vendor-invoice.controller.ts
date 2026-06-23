import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { VendorInvoiceService } from './vendor-invoice.service';
import {
  CreateVendorInvoiceDto,
  RecordPaymentDto,
  RejectInvoiceDto,
  ListInvoicesQueryDto,
  SaveTolerancePolicyDto,
  OverrideBlockDto,
} from './dto/vendor-invoice.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('procurement-vendor-invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/vendor-invoices')
export class VendorInvoiceController {
  constructor(private readonly service: VendorInvoiceService) {}

  @Get()
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'List vendor invoices' })
  @ApiQuery({ name: 'vendorId', required: false })
  @ApiQuery({ name: 'poId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@CurrentUser() user: any, @Query() query: ListInvoicesQueryDto) {
    return this.service.listInvoices(user.tenantId, query);
  }

  @Get('tolerance-policy')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get the tenant tolerance policy' })
  getTolerancePolicy(@CurrentUser() user: any) {
    return this.service.getPolicy(user.tenantId);
  }

  @Get('blocked')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'List invoices blocked by tolerance breach' })
  getBlocked(@CurrentUser() user: any) {
    return this.service.getBlockedInvoices(user.tenantId);
  }

  @Post('tolerance-policy')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Create/update the tenant tolerance policy' })
  saveTolerancePolicy(@CurrentUser() user: any, @Body() dto: SaveTolerancePolicyDto) {
    return this.service.savePolicy(user.tenantId, dto);
  }

  @Get(':id')
  @RequirePermission('procurement:grn:read')
  @ApiOperation({ summary: 'Get a vendor invoice with lines' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getInvoice(user.tenantId, id);
  }

  @Post()
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Create a vendor invoice' })
  create(@CurrentUser() user: any, @Body() dto: CreateVendorInvoiceDto) {
    return this.service.createInvoice(user.tenantId, dto);
  }

  @Post(':id/submit')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Submit a DRAFT invoice' })
  submit(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submitInvoice(user.tenantId, id);
  }

  @Post(':id/review')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Mark invoice as UNDER_REVIEW' })
  review(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.reviewInvoice(user.tenantId, id);
  }

  @Post(':id/match')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Perform 3-way match on invoice' })
  match(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.performThreeWayMatch(user.tenantId, id);
  }

  @Post(':id/approve')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Approve a MATCHED invoice' })
  approve(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveInvoice(user.tenantId, id, user.id);
  }

  @Post(':id/reject')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Reject an invoice' })
  reject(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: RejectInvoiceDto) {
    return this.service.rejectInvoice(user.tenantId, id, dto.reason);
  }

  @Post(':id/payment')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Record a payment against an invoice' })
  recordPayment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: RecordPaymentDto,
  ) {
    return this.service.recordPayment(user.tenantId, id, dto.amount);
  }

  @Post(':id/override-block')
  @RequirePermission('procurement:grn:create')
  @ApiOperation({ summary: 'Manually clear a tolerance block so the invoice can post' })
  overrideBlock(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: OverrideBlockDto,
  ) {
    return this.service.overrideBlock(user.tenantId, id, dto.note);
  }
}
