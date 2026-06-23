import {
  Controller, Get, Post, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  ReturnsCreditService, CreateReturnOrderDto, CreateCreditNoteDto,
} from './returns-credit.service';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales')
export class ReturnsCreditController {
  constructor(private readonly service: ReturnsCreditService) {}

  // ---- Return Orders ----
  @Get('returns')
  @RequirePermission('sales:orders:read')
  listReturns(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listReturns(user.tenantId, { customerId, status });
  }

  @Get('returns/:id')
  @RequirePermission('sales:orders:read')
  getReturn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getReturn(user.tenantId, id);
  }

  @Post('returns')
  @RequirePermission('sales:orders:create')
  createReturn(@CurrentUser() user: any, @Body() dto: CreateReturnOrderDto) {
    return this.service.createReturn(user.tenantId, dto);
  }

  @Post('returns/:id/receive')
  @RequirePermission('sales:orders:update')
  receiveReturn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.receiveReturn(user.tenantId, id);
  }

  @Post('returns/:id/cancel')
  @RequirePermission('sales:orders:update')
  cancelReturn(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelReturn(user.tenantId, id);
  }

  // ---- Credit Notes ----
  @Get('credit-notes')
  @RequirePermission('sales:orders:read')
  listCreditNotes(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listCreditNotes(user.tenantId, { customerId, status });
  }

  @Post('credit-notes')
  @RequirePermission('sales:orders:create')
  createCreditNote(@CurrentUser() user: any, @Body() dto: CreateCreditNoteDto) {
    return this.service.createCreditNote(user.tenantId, dto);
  }

  @Post('credit-notes/:id/issue')
  @RequirePermission('sales:orders:update')
  issueCreditNote(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.issueCreditNote(user.tenantId, id);
  }

  @Post('credit-notes/:id/apply')
  @RequirePermission('sales:orders:update')
  applyCreditNote(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { invoiceId: string },
  ) {
    return this.service.applyCreditNote(user.tenantId, id, body.invoiceId);
  }
}
