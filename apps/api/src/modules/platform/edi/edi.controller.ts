import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EdiService } from './edi.service';
import { CreateTradingPartnerDto, UpdateTradingPartnerDto, ListTransactionsQueryDto } from './dto/edi.dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('platform/edi')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EdiController {
  constructor(private readonly ediService: EdiService) {}

  // ---- Trading Partners ----

  @Get('partners')
  @RequirePermission('edi:read')
  listPartners(@CurrentUser() user: { tenantId: string }) {
    return this.ediService.listPartners(user.tenantId);
  }

  @Get('partners/:id')
  @RequirePermission('edi:read')
  getPartner(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.ediService.getPartner(user.tenantId, id);
  }

  @Post('partners')
  @RequirePermission('edi:write')
  createPartner(@CurrentUser() user: { tenantId: string }, @Body() dto: CreateTradingPartnerDto) {
    return this.ediService.createPartner(user.tenantId, dto);
  }

  @Patch('partners/:id')
  @RequirePermission('edi:write')
  updatePartner(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
    @Body() dto: UpdateTradingPartnerDto,
  ) {
    return this.ediService.updatePartner(user.tenantId, id, dto);
  }

  @Delete('partners/:id')
  @RequirePermission('edi:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePartner(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.ediService.deletePartner(user.tenantId, id);
  }

  // ---- Transaction Log ----

  @Get('transactions')
  @RequirePermission('edi:read')
  listTransactions(
    @CurrentUser() user: { tenantId: string },
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.ediService.listTransactions(user.tenantId, query);
  }

  @Get('transactions/:id')
  @RequirePermission('edi:read')
  getTransaction(@CurrentUser() user: { tenantId: string }, @Param('id') id: string) {
    return this.ediService.getTransaction(user.tenantId, id);
  }

  // ---- Inbound Processing ----

  @Post('inbound')
  @RequirePermission('edi:write')
  processInbound(
    @CurrentUser() user: { tenantId: string },
    @Body() body: { tradingPartnerId: string; rawContent: string },
  ) {
    return this.ediService.processInbound(user.tenantId, body.tradingPartnerId, body.rawContent);
  }

  // ---- Outbound Generation ----

  @Post('outbound/850')
  @RequirePermission('edi:write')
  generateOutbound850(
    @CurrentUser() user: { tenantId: string },
    @Body()
    body: {
      tradingPartnerId: string;
      purchaseOrderNumber: string;
      vendorName?: string;
      lineItems: Array<{
        lineNumber: number;
        quantity: number;
        unit: string;
        unitPrice: number;
        productCode: string;
        description?: string;
      }>;
    },
  ) {
    return this.ediService.generateOutbound850(user.tenantId, body.tradingPartnerId, {
      purchaseOrderNumber: body.purchaseOrderNumber,
      vendorName: body.vendorName,
      lineItems: body.lineItems,
    });
  }
}
