import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateSalesOrderDto, UpdateSalesOrderDto, ShipOrderDto,
  CreatePriceListDto, PriceListItemDto,
} from './dto/sales.dto';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  // Orders
  @Get('orders')
  @RequirePermission('sales:orders:read')
  listOrders(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listOrders(user.tenantId, pagination, { status, customerId, search });
  }

  @Get('orders/:id')
  @RequirePermission('sales:orders:read')
  getOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findOrder(user.tenantId, id);
  }

  @Get('orders/:id/lines')
  @RequirePermission('sales:orders:read')
  getOrderLines(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getOrderLines(user.tenantId, id);
  }

  @Post('orders')
  @RequirePermission('sales:orders:create')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateSalesOrderDto) {
    return this.service.createOrder(user.tenantId, dto);
  }

  @Patch('orders/:id')
  @RequirePermission('sales:orders:update')
  updateOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateSalesOrderDto) {
    return this.service.updateOrder(user.tenantId, id, dto);
  }

  @Post('orders/:id/confirm')
  @RequirePermission('sales:orders:update')
  confirmOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.confirmOrder(user.tenantId, id);
  }

  @Post('orders/:id/ship')
  @RequirePermission('sales:orders:update')
  shipOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ShipOrderDto) {
    return this.service.shipOrder(user.tenantId, id, dto);
  }

  @Post('orders/:id/complete')
  @RequirePermission('sales:orders:update')
  completeOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.completeOrder(user.tenantId, id, user.id);
  }

  @Post('orders/:id/cancel')
  @RequirePermission('sales:orders:update')
  cancelOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancelOrder(user.tenantId, id);
  }

  @Post('orders/from-quote/:quoteId')
  @RequirePermission('sales:orders:create')
  convertFromQuote(
    @CurrentUser() user: any,
    @Param('quoteId') quoteId: string,
    @Body() dto: Partial<CreateSalesOrderDto>,
  ) {
    return this.service.convertFromQuote(user.tenantId, quoteId, dto);
  }

  // Price Lists
  @Get('price-lists')
  @RequirePermission('sales:orders:read')
  listPriceLists(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listPriceLists(user.tenantId, pagination);
  }

  @Post('price-lists')
  @RequirePermission('sales:orders:manage')
  createPriceList(@CurrentUser() user: any, @Body() dto: CreatePriceListDto) {
    return this.service.createPriceList(user.tenantId, dto);
  }

  @Get('price-lists/:id/items')
  @RequirePermission('sales:orders:read')
  getPriceListItems(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getPriceListItems(user.tenantId, id);
  }

  @Post('price-lists/:id/items')
  @RequirePermission('sales:orders:manage')
  addPriceListItem(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: PriceListItemDto) {
    return this.service.addPriceListItem(user.tenantId, id, dto);
  }
}
