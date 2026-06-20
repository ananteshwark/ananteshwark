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
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

// ─── Warehouse Controller ─────────────────────────────────────────────────────

@ApiTags('inventory-warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/warehouses')
export class WarehouseController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('inventory:items:read')
  @ApiOperation({ summary: 'List warehouses' })
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findWarehouses(user.tenantId, pagination);
  }

  @Get(':id')
  @RequirePermission('inventory:items:read')
  @ApiOperation({ summary: 'Get warehouse by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findWarehouse(user.tenantId, id);
  }

  @Post()
  @RequirePermission('inventory:items:create')
  @ApiOperation({ summary: 'Create warehouse' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createWarehouse(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('inventory:items:update')
  @ApiOperation({ summary: 'Update warehouse' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateWarehouse(user.tenantId, id, dto);
  }
}

// ─── Category Controller ──────────────────────────────────────────────────────

@ApiTags('inventory-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/categories')
export class CategoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('inventory:items:read')
  @ApiOperation({ summary: 'List item categories' })
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findCategories(user.tenantId, pagination);
  }

  @Post()
  @RequirePermission('inventory:items:create')
  @ApiOperation({ summary: 'Create item category' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCategory(user.tenantId, dto);
  }
}

// ─── Item Controller ──────────────────────────────────────────────────────────

@ApiTags('inventory-items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/items')
export class ItemController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('inventory:items:read')
  @ApiOperation({ summary: 'List items' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false })
  list(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('search') search?: string,
    @Query('type') type?: string,
  ) {
    return this.service.findItems(user.tenantId, pagination, { search, type });
  }

  @Get(':id')
  @RequirePermission('inventory:items:read')
  @ApiOperation({ summary: 'Get item by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findItem(user.tenantId, id);
  }

  @Post()
  @RequirePermission('inventory:items:create')
  @ApiOperation({ summary: 'Create item' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createItem(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('inventory:items:update')
  @ApiOperation({ summary: 'Update item' })
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateItem(user.tenantId, id, dto);
  }
}

// ─── Stock Controller ─────────────────────────────────────────────────────────

@ApiTags('inventory-stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly service: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'Get stock balances' })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  getBalances(
    @CurrentUser() user: any,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.getStockBalance(user.tenantId, itemId, warehouseId);
  }

  @Get('ledger')
  @RequirePermission('inventory:stock:read')
  @ApiOperation({ summary: 'Get stock ledger' })
  @ApiQuery({ name: 'itemId', required: true })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getLedger(
    @CurrentUser() user: any,
    @Query() pagination: PaginationDto,
    @Query('itemId') itemId: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getStockLedger(user.tenantId, itemId, warehouseId, from, to, pagination);
  }

  @Post('receive')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Receive stock' })
  receive(@CurrentUser() user: any, @Body() body: any) {
    return this.service.receiveStock(
      user.tenantId,
      body.itemId,
      body.warehouseId,
      body.qty,
      body.unitCost,
      body.referenceType,
      body.referenceId,
      body.date,
      body.notes,
    );
  }

  @Post('issue')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Issue stock' })
  issue(@CurrentUser() user: any, @Body() body: any) {
    return this.service.issueStock(
      user.tenantId,
      body.itemId,
      body.warehouseId,
      body.qty,
      body.referenceType,
      body.referenceId,
      body.date,
      body.notes,
    );
  }

  @Post('transfer')
  @RequirePermission('inventory:stock:transact')
  @ApiOperation({ summary: 'Transfer stock between warehouses' })
  transfer(@CurrentUser() user: any, @Body() body: any) {
    return this.service.transferStock(
      user.tenantId,
      body.fromWarehouseId,
      body.toWarehouseId,
      body.itemId,
      body.qty,
      body.date,
    );
  }
}

// ─── Adjustment Controller ────────────────────────────────────────────────────

@ApiTags('inventory-adjustments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/adjustments')
export class AdjustmentController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('inventory:adjustments:manage')
  @ApiOperation({ summary: 'List stock adjustments' })
  list(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.findAdjustments(user.tenantId, pagination);
  }

  @Get(':id')
  @RequirePermission('inventory:adjustments:manage')
  @ApiOperation({ summary: 'Get adjustment by ID' })
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.findAdjustment(user.tenantId, id);
  }

  @Post()
  @RequirePermission('inventory:adjustments:manage')
  @ApiOperation({ summary: 'Create stock adjustment' })
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createAdjustment(user.tenantId, dto);
  }

  @Post(':id/post')
  @RequirePermission('inventory:adjustments:manage')
  @ApiOperation({ summary: 'Post stock adjustment' })
  post(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.postAdjustment(user.tenantId, id);
  }
}
