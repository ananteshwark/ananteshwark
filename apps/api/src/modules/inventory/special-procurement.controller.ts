import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SpecialProcurementService } from './special-procurement.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('inventory-special-procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/special-procurement')
export class SpecialProcurementController {
  constructor(private readonly service: SpecialProcurementService) {}

  // ─── Subcontracting ──────────────────────────────────────────────────────────

  @Get('subcontracts')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'List subcontract orders' })
  listSubcontracts(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listSubcontractOrders(user.tenantId, pagination);
  }

  @Get('subcontracts/:id')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'Get subcontract order' })
  getSubcontract(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getSubcontractOrder(user.tenantId, id);
  }

  @Post('subcontracts')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Create subcontract order' })
  createSubcontract(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createSubcontractOrder(user.tenantId, dto);
  }

  @Post('subcontracts/:id/send-components')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Send components to subcontractor' })
  sendComponents(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { date?: string },
  ) {
    return this.service.sendComponents(user.tenantId, id, body?.date);
  }

  @Post('subcontracts/:id/receive-finished')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Receive finished goods from subcontractor' })
  receiveFinished(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { date?: string },
  ) {
    return this.service.receiveFinishedGoods(user.tenantId, id, body?.date);
  }

  @Post('subcontracts/:id/complete')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Complete subcontract order' })
  completeSubcontract(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.completeSubcontractOrder(user.tenantId, id);
  }

  // ─── Consignment Stock ───────────────────────────────────────────────────────

  @Get('consignment')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'List consignment stock' })
  listConsignment(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('vendorId') vendorId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.service.listConsignmentStock(user.tenantId, pagination, { vendorId, itemId });
  }

  @Post('consignment/receive')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Receive consignment stock from vendor' })
  receiveConsignment(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.receiveConsignment(user.tenantId, dto);
  }

  @Post('consignment/:id/consume')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Consume consignment stock (transfer ownership)' })
  consumeConsignment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { qty: number; date?: string },
  ) {
    return this.service.consumeConsignment(user.tenantId, id, body.qty, body.date);
  }

  @Post('consignment/:id/return')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Return consignment stock to vendor' })
  returnConsignment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { qty: number; date?: string },
  ) {
    return this.service.returnConsignment(user.tenantId, id, body.qty, body.date);
  }

  // ─── Stock Transfer Orders ───────────────────────────────────────────────────

  @Get('stos')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'List stock transfer orders' })
  listStos(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listStos(user.tenantId, pagination);
  }

  @Get('stos/:id')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'Get stock transfer order' })
  getSto(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getSto(user.tenantId, id);
  }

  @Post('stos')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Create stock transfer order' })
  createSto(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createSto(user.tenantId, dto, user.id);
  }

  @Post('stos/:id/approve')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Approve stock transfer order' })
  approveSto(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.approveSto(user.tenantId, id, user.id);
  }

  @Post('stos/:id/issue-goods')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Issue goods from source warehouse' })
  issueGoods(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { date?: string },
  ) {
    return this.service.issueGoodsSto(user.tenantId, id, body?.date);
  }

  @Post('stos/:id/receive-goods')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Receive goods at destination warehouse' })
  receiveGoods(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { date?: string },
  ) {
    return this.service.receiveGoodsSto(user.tenantId, id, body?.date);
  }

  @Post('stos/:id/complete')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Complete stock transfer order' })
  completeSto(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.completeSto(user.tenantId, id);
  }
}
