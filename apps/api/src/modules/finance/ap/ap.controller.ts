import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApService } from './ap.service';
import { renderBillPrint } from './bill-print.template';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreateVendorDto,
  UpdateVendorDto,
  CreateBillDto,
  UpdateBillDto,
  CreateVendorPaymentDto,
  AllocatePaymentDto,
} from './dto/ap.dto';
import { BillStatus } from './entities/bill.entity';

@ApiTags('finance-ap')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/ap')
export class ApController {
  constructor(private readonly apService: ApService) {}

  // Vendors
  @Get('vendors')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'List vendors (paginated)' })
  @ApiQuery({ name: 'search', required: false })
  listVendors(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.apService.findVendors(user.tenantId, pagination, search);
  }

  @Get('vendors/:id')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Get vendor by ID' })
  getVendor(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.findVendor(user.tenantId, id);
  }

  @Get('vendors/:id/summary')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Vendor balance/summary (open items total, payment history count)' })
  getVendorSummary(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.getVendorSummary(user.tenantId, id);
  }

  @Post('vendors')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Create a vendor' })
  createVendor(@CurrentUser() user: any, @Body() dto: CreateVendorDto) {
    return this.apService.createVendor(user.tenantId, dto);
  }

  @Patch('vendors/:id')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Update a vendor' })
  updateVendor(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.apService.updateVendor(user.tenantId, id, dto);
  }

  // Bills
  @Get('bills')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'List bills (paginated)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'vendorId', required: false })
  listBills(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: BillStatus,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.apService.findBills(user.tenantId, pagination, { status, vendorId });
  }

  @Get('bills/:id')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Get bill with lines' })
  getBill(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.findBill(user.tenantId, id);
  }

  @Post('bills')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Create a draft bill' })
  createBill(@CurrentUser() user: any, @Body() dto: CreateBillDto) {
    return this.apService.createBill(user.tenantId, dto);
  }

  @Patch('bills/:id')
  @RequirePermission('finance:ap:create')
  @ApiOperation({ summary: 'Update a draft bill' })
  updateBill(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateBillDto,
  ) {
    return this.apService.updateBill(user.tenantId, id, dto);
  }

  @Get('bills/:id/print')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Render a printable HTML view of a bill' })
  async printBill(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { bill, vendor, lines } = await this.apService.getBillForPrint(user.tenantId, id);
    const html = renderBillPrint({
      bill,
      vendor,
      lines,
      companyName: user.tenantName || 'Company',
    });
    res.set({ 'Content-Type': 'text/html; charset=utf-8' });
    res.send(html);
  }

  @Post('bills/:id/post')
  @RequirePermission('finance:ap:post')
  @ApiOperation({ summary: 'Post a bill (creates Dr expense / Cr AP journal entry)' })
  postBill(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.postBill(user.tenantId, id, user.id);
  }

  @Post('bills/:id/void')
  @RequirePermission('finance:ap:post')
  @ApiOperation({ summary: 'Void a bill (reverses its journal entry)' })
  voidBill(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.voidBill(user.tenantId, id, user.id);
  }

  // Vendor Payments
  @Get('vendor-payments')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'List vendor payments (paginated)' })
  @ApiQuery({ name: 'vendorId', required: false })
  listPayments(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('vendorId') vendorId?: string,
  ) {
    return this.apService.findVendorPayments(user.tenantId, pagination, vendorId);
  }

  @Get('vendor-payments/:id')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'Get vendor payment with allocations' })
  getPayment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.apService.findVendorPayment(user.tenantId, id);
  }

  @Post('vendor-payments')
  @RequirePermission('finance:ap:post')
  @ApiOperation({ summary: 'Record a vendor payment (creates Dr AP / Cr Bank journal entry)' })
  createPayment(@CurrentUser() user: any, @Body() dto: CreateVendorPaymentDto) {
    return this.apService.createVendorPayment(user.tenantId, dto, user.id);
  }

  @Post('vendor-payments/:id/allocate')
  @RequirePermission('finance:ap:post')
  @ApiOperation({ summary: 'Allocate a vendor payment to bills' })
  allocate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AllocatePaymentDto,
  ) {
    return this.apService.allocatePayment(user.tenantId, id, dto);
  }

  // Ageing
  @Get('ageing')
  @RequirePermission('finance:ap:read')
  @ApiOperation({ summary: 'AP ageing report (current, 1-30, 31-60, 61-90, 90+)' })
  @ApiQuery({ name: 'asOf', required: false })
  ageing(@CurrentUser() user: any, @Query('asOf') asOf?: string) {
    return this.apService.getAgeing(user.tenantId, asOf);
  }
}
