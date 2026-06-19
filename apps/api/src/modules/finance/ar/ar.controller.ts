import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ArService } from './ar.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  CreateCustomerReceiptDto,
  AllocateReceiptDto,
} from './dto/ar.dto';
import { InvoiceStatus } from './entities/invoice.entity';

@ApiTags('finance-ar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/ar')
export class ArController {
  constructor(private readonly arService: ArService) {}

  // Customers
  @Get('customers')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'List customers (paginated)' })
  @ApiQuery({ name: 'search', required: false })
  listCustomers(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
  ) {
    return this.arService.findCustomers(user.tenantId, pagination, search);
  }

  @Get('customers/:id')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Get customer by ID' })
  getCustomer(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.findCustomer(user.tenantId, id);
  }

  @Post('customers')
  @RequirePermission('finance:ar:create')
  @ApiOperation({ summary: 'Create a customer' })
  createCustomer(@CurrentUser() user: any, @Body() dto: CreateCustomerDto) {
    return this.arService.createCustomer(user.tenantId, dto);
  }

  @Patch('customers/:id')
  @RequirePermission('finance:ar:create')
  @ApiOperation({ summary: 'Update a customer' })
  updateCustomer(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.arService.updateCustomer(user.tenantId, id, dto);
  }

  // Invoices
  @Get('invoices')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'List invoices (paginated)' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'customerId', required: false })
  listInvoices(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: InvoiceStatus,
    @Query('customerId') customerId?: string,
  ) {
    return this.arService.findInvoices(user.tenantId, pagination, { status, customerId });
  }

  @Get('invoices/:id')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Get invoice with lines' })
  getInvoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.findInvoice(user.tenantId, id);
  }

  @Post('invoices')
  @RequirePermission('finance:ar:create')
  @ApiOperation({ summary: 'Create a draft invoice' })
  createInvoice(@CurrentUser() user: any, @Body() dto: CreateInvoiceDto) {
    return this.arService.createInvoice(user.tenantId, dto);
  }

  @Patch('invoices/:id')
  @RequirePermission('finance:ar:create')
  @ApiOperation({ summary: 'Update a draft invoice' })
  updateInvoice(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.arService.updateInvoice(user.tenantId, id, dto);
  }

  @Post('invoices/:id/post')
  @RequirePermission('finance:ar:post')
  @ApiOperation({ summary: 'Post an invoice (creates Dr AR / Cr revenue journal entry)' })
  postInvoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.postInvoice(user.tenantId, id, user.id);
  }

  @Post('invoices/:id/void')
  @RequirePermission('finance:ar:post')
  @ApiOperation({ summary: 'Void an invoice (reverses its journal entry)' })
  voidInvoice(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.voidInvoice(user.tenantId, id, user.id);
  }

  @Get('invoices/:id/lines')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Get invoice lines' })
  getInvoiceLines(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.findInvoice(user.tenantId, id);
  }

  // Customer Receipts
  @Get('receipts')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'List customer receipts (paginated)' })
  @ApiQuery({ name: 'customerId', required: false })
  listReceipts(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('customerId') customerId?: string,
  ) {
    return this.arService.findReceipts(user.tenantId, pagination, customerId);
  }

  @Get('receipts/:id')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Get customer receipt with allocations' })
  getReceipt(@CurrentUser() user: any, @Param('id') id: string) {
    return this.arService.findReceipt(user.tenantId, id);
  }

  @Post('receipts')
  @RequirePermission('finance:ar:post')
  @ApiOperation({ summary: 'Record a customer receipt (creates Dr Bank / Cr AR journal entry)' })
  createReceipt(@CurrentUser() user: any, @Body() dto: CreateCustomerReceiptDto) {
    return this.arService.createCustomerReceipt(user.tenantId, dto, user.id);
  }

  @Post('receipts/:id/allocate')
  @RequirePermission('finance:ar:post')
  @ApiOperation({ summary: 'Allocate a customer receipt to invoices' })
  allocate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AllocateReceiptDto,
  ) {
    return this.arService.allocateReceipt(user.tenantId, id, dto);
  }

  // Ageing
  @Get('ageing')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'AR ageing report (current, 1-30, 31-60, 61-90, 90+)' })
  @ApiQuery({ name: 'asOf', required: false })
  ageing(@CurrentUser() user: any, @Query('asOf') asOf?: string) {
    return this.arService.getAgeing(user.tenantId, asOf);
  }
}
