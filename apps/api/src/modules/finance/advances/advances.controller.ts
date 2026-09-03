import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { AdvancesService } from './advances.service';
import {
  CreateVendorAdvanceDto,
  PayVendorAdvanceDto,
  ClearVendorAdvanceDto,
  CreateCustomerAdvanceDto,
  ClearCustomerAdvanceDto,
} from './dto/advances.dto';

@ApiTags('finance-advances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('finance/advances')
export class AdvancesController {
  constructor(private readonly advancesService: AdvancesService) {}

  // ─── Vendor advances ───────────────────────────────────────────────────────

  @Get('vendor')
  @ApiOperation({ summary: 'List vendor advances' })
  listVendor(@CurrentUser() user: any, @Query('vendorId') vendorId?: string) {
    return this.advancesService.listVendorAdvances(user.tenantId, vendorId);
  }

  @Post('vendor')
  @RequirePermission('finance:ap:write')
  @ApiOperation({ summary: 'Create vendor advance request' })
  createVendor(@CurrentUser() user: any, @Body() dto: CreateVendorAdvanceDto) {
    return this.advancesService.createVendorAdvance(user.tenantId, dto);
  }

  @Post('vendor/:id/pay')
  @RequirePermission('finance:ap:write')
  @ApiOperation({ summary: 'Record payment of a vendor advance' })
  payVendor(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayVendorAdvanceDto,
  ) {
    return this.advancesService.payVendorAdvance(user.tenantId, id, dto);
  }

  @Post('vendor/:id/clear')
  @RequirePermission('finance:ap:write')
  @ApiOperation({ summary: 'Clear a vendor advance against a bill' })
  clearVendor(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClearVendorAdvanceDto,
  ) {
    return this.advancesService.clearVendorAdvance(user.tenantId, id, dto);
  }

  // ─── Customer advances ─────────────────────────────────────────────────────

  @Get('customer')
  @ApiOperation({ summary: 'List customer advances' })
  listCustomer(@CurrentUser() user: any, @Query('customerId') customerId?: string) {
    return this.advancesService.listCustomerAdvances(user.tenantId, customerId);
  }

  @Post('customer')
  @RequirePermission('finance:ar:write')
  @ApiOperation({ summary: 'Record a customer advance receipt' })
  createCustomer(@CurrentUser() user: any, @Body() dto: CreateCustomerAdvanceDto) {
    return this.advancesService.createCustomerAdvance(user.tenantId, dto);
  }

  @Post('customer/:id/clear')
  @RequirePermission('finance:ar:write')
  @ApiOperation({ summary: 'Clear a customer advance against an invoice' })
  clearCustomer(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClearCustomerAdvanceDto,
  ) {
    return this.advancesService.clearCustomerAdvance(user.tenantId, id, dto);
  }

  // ─── Aging ─────────────────────────────────────────────────────────────────

  @Get('aging')
  @ApiOperation({ summary: 'Uncleared advance aging (vendor + customer)' })
  aging(@CurrentUser() user: any) {
    return this.advancesService.aging(user.tenantId);
  }
}
