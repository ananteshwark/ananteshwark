import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InventoryV2Service } from './inventory-v2.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('inventory-v2')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/v2')
export class InventoryV2Controller {
  constructor(private readonly svc: InventoryV2Service) {}

  // Bin Locations
  @Get('bins')
  @RequirePermission('inventory:read')
  listBins(@CurrentUser() u: any, @Query('warehouseId') warehouseId?: string) {
    return this.svc.listBins(u.tenantId, warehouseId);
  }

  @Post('bins')
  @RequirePermission('inventory:manage')
  createBin(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.createBin(u.tenantId, dto);
  }

  // Lots & Serials
  @Get('lots')
  @RequirePermission('inventory:read')
  listLots(@CurrentUser() u: any, @Query('itemId') itemId?: string) {
    return this.svc.listLots(u.tenantId, itemId);
  }

  @Post('lots')
  @RequirePermission('inventory:manage')
  receiveLot(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.receiveLot(u.tenantId, dto);
  }

  @Patch('lots/:id/quarantine')
  @RequirePermission('inventory:manage')
  quarantineLot(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.quarantineLot(u.tenantId, id);
  }

  // UoM Conversions
  @Get('uom-conversions')
  @RequirePermission('inventory:read')
  listConversions(@CurrentUser() u: any, @Query('itemId') itemId?: string) {
    return this.svc.listConversions(u.tenantId, itemId);
  }

  @Post('uom-conversions')
  @RequirePermission('inventory:manage')
  createConversion(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.createConversion(u.tenantId, dto);
  }

  // Cycle Counts
  @Get('cycle-counts')
  @RequirePermission('inventory:read')
  listCycleCounts(@CurrentUser() u: any, @Query() pagination: PaginationDto) {
    return this.svc.listCycleCounts(u.tenantId, pagination);
  }

  @Post('cycle-counts')
  @RequirePermission('inventory:manage')
  createCycleCount(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.createCycleCount(u.tenantId, dto);
  }

  @Get('cycle-counts/:id/lines')
  @RequirePermission('inventory:read')
  getCountLines(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.getCountLines(u.tenantId, id);
  }

  @Patch('cycle-counts/:id/lines/:lineId/count')
  @RequirePermission('inventory:manage')
  enterCount(@CurrentUser() u: any, @Param('lineId') lineId: string, @Body() body: { countedQty: number }) {
    return this.svc.enterCountedQty(u.tenantId, lineId, body.countedQty);
  }

  @Post('cycle-counts/:id/post')
  @RequirePermission('inventory:manage')
  postCount(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.postCycleCount(u.tenantId, id);
  }

  // RMA
  @Get('rmas')
  @RequirePermission('inventory:read')
  listRmas(@CurrentUser() u: any, @Query() pagination: PaginationDto) {
    return this.svc.listRmas(u.tenantId, pagination);
  }

  @Post('rmas')
  @RequirePermission('inventory:manage')
  createRma(@CurrentUser() u: any, @Body() dto: any) {
    return this.svc.createRma(u.tenantId, dto);
  }

  @Post('rmas/:id/approve')
  @RequirePermission('inventory:manage')
  approveRma(@CurrentUser() u: any, @Param('id') id: string) {
    return this.svc.approveRma(u.tenantId, id);
  }

  @Post('rmas/:id/receive')
  @RequirePermission('inventory:manage')
  receiveRma(@CurrentUser() u: any, @Param('id') id: string, @Body() body: { receivedDate: string }) {
    return this.svc.receiveRma(u.tenantId, id, body.receivedDate);
  }
}
