import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';

@ApiTags('finance-ar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/ar/invoices')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ApiOperation({ summary: 'List invoices' })
  findAll(@CurrentUser() user: any) {
    return this.invoiceService.findAll(user.tenantId);
  }

  @Post()
  @RequirePermission('finance:ar:write')
  @ApiOperation({ summary: 'Create a draft invoice' })
  create(@CurrentUser() user: any, @Body() dto: CreateInvoiceDto) {
    return this.invoiceService.create(user.tenantId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by id' })
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.findById(user.tenantId, id);
  }

  @Post(':id/post')
  @RequirePermission('finance:ar:write')
  @ApiOperation({ summary: 'Post an invoice (compute and save tax lines)' })
  postInvoice(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.postInvoice(user.tenantId, id);
  }

  @Get(':id/tax-lines')
  @ApiOperation({ summary: 'Get tax lines for an invoice' })
  getTaxLines(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoiceService.getTaxLines(user.tenantId, id);
  }
}
