import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ManufacturingService } from './manufacturing.service';
import { MrpService } from './mrp.service';
import { FcsService } from './fcs.service';
import { SlotStatus } from './entities/capacity-slot.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateBomDto, CreateWorkCenterDto, CreateProductionOrderDto,
  CompleteProductionOrderDto, IssueMaterialDto,
  CreateRoutingDto, UpdateRoutingDto, RunMrpDto, ConfirmOperationDto, SettleOrderDto,
} from './dto/manufacturing.dto';

@ApiTags('manufacturing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing')
export class ManufacturingController {
  constructor(
    private readonly service: ManufacturingService,
    private readonly mrpService: MrpService,
    private readonly fcsService: FcsService,
  ) {}

  // BOMs
  @Get('boms')
  @RequirePermission('manufacturing:read')
  listBoms(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    return this.service.listBoms(user.tenantId, pagination);
  }

  @Get('boms/:id')
  @RequirePermission('manufacturing:read')
  getBom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getBom(user.tenantId, id);
  }

  @Post('boms')
  @RequirePermission('manufacturing:manage')
  createBom(@CurrentUser() user: any, @Body() dto: CreateBomDto) {
    return this.service.createBom(user.tenantId, dto);
  }

  @Post('boms/:id/activate')
  @RequirePermission('manufacturing:manage')
  activateBom(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.activateBom(user.tenantId, id);
  }

  // Work Centers
  @Get('work-centers')
  @RequirePermission('manufacturing:read')
  listWorkCenters(@CurrentUser() user: any) {
    return this.service.listWorkCenters(user.tenantId);
  }

  @Post('work-centers')
  @RequirePermission('manufacturing:manage')
  createWorkCenter(@CurrentUser() user: any, @Body() dto: CreateWorkCenterDto) {
    return this.service.createWorkCenter(user.tenantId, dto);
  }

  // Production Orders
  @Get('orders')
  @RequirePermission('manufacturing:read')
  listOrders(@CurrentUser() user: any, @Query() pagination: PaginationDto, @Query('status') status?: string) {
    return this.service.listOrders(user.tenantId, pagination, status);
  }

  @Post('orders')
  @RequirePermission('manufacturing:manage')
  createOrder(@CurrentUser() user: any, @Body() dto: CreateProductionOrderDto) {
    return this.service.createOrder(user.tenantId, dto);
  }

  @Post('orders/:id/release')
  @RequirePermission('manufacturing:manage')
  releaseOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.releaseOrder(user.tenantId, id);
  }

  @Post('orders/:id/complete')
  @RequirePermission('manufacturing:manage')
  completeOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CompleteProductionOrderDto) {
    return this.service.completeOrder(user.tenantId, id, dto, user.id);
  }

  @Post('orders/:id/issue-material')
  @RequirePermission('manufacturing:manage')
  issueMaterial(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: IssueMaterialDto) {
    return this.service.issueMaterial(user.tenantId, id, dto);
  }

  @Get('orders/:id/issuances')
  @RequirePermission('manufacturing:read')
  getIssuances(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getIssuances(user.tenantId, id);
  }

  // ─── Phase 46: Routing & Capacity ───────────────────────────────
  @Get('routings')
  @RequirePermission('manufacturing:read')
  listRoutings(@CurrentUser() user: any) {
    return this.service.listRoutings(user.tenantId);
  }

  @Post('routings')
  @RequirePermission('manufacturing:manage')
  createRouting(@CurrentUser() user: any, @Body() dto: CreateRoutingDto) {
    return this.service.createRouting(user.tenantId, dto);
  }

  @Patch('routings/:id')
  @RequirePermission('manufacturing:manage')
  updateRouting(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpdateRoutingDto) {
    return this.service.updateRouting(user.tenantId, id, dto);
  }

  @Get('capacity-load')
  @RequirePermission('manufacturing:read')
  getCapacityLoad(@CurrentUser() user: any, @Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.service.getCapacityLoad(user.tenantId, fromDate, toDate);
  }

  // ─── Phase 47: MRP ──────────────────────────────────────────────
  @Post('mrp/run')
  @RequirePermission('manufacturing:manage')
  runMrp(@CurrentUser() user: any, @Body() dto: RunMrpDto) {
    return this.mrpService.runMrp(user.tenantId, dto);
  }

  @Get('mrp/planned-orders')
  @RequirePermission('manufacturing:read')
  listPlannedOrders(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.mrpService.listPlannedOrders(user.tenantId, status);
  }

  @Post('mrp/planned-orders/:id/convert')
  @RequirePermission('manufacturing:manage')
  convertPlannedOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.mrpService.convertPlannedOrder(user.tenantId, id);
  }

  @Get('mrp/requirements/:itemId')
  @RequirePermission('manufacturing:read')
  getStockRequirements(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.mrpService.getStockRequirements(user.tenantId, itemId);
  }

  // ─── Phase 48: Production Order Costing ──────────────────────────
  @Post('production-orders/:id/calculate-cost')
  @RequirePermission('manufacturing:manage')
  calculateCost(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.calculatePlannedCost(user.tenantId, id);
  }

  @Post('production-orders/:id/confirm')
  @RequirePermission('manufacturing:manage')
  confirmOperation(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: ConfirmOperationDto) {
    return this.service.confirmOperation(user.tenantId, id, dto);
  }

  @Post('production-orders/:id/settle')
  @RequirePermission('manufacturing:manage')
  settleOrder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: SettleOrderDto) {
    return this.service.settleOrder(user.tenantId, id, dto);
  }

  @Get('production-orders/:id/cost-sheet')
  @RequirePermission('manufacturing:read')
  getCostSheet(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCostSheet(user.tenantId, id);
  }

  // ─── Phase 80: GL Reconciliation + Retry ────────────────────────────────

  @Get('gl-reconciliation')
  @RequirePermission('manufacturing:read')
  @ApiOperation({ summary: 'List COMPLETED/SETTLED orders missing a GL journal entry' })
  getGlReconciliation(@CurrentUser() user: any) {
    return this.service.getGlReconciliation(user.tenantId);
  }

  @Post('production-orders/:id/retry-gl')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Retry GL posting for a COMPLETED order with missing journal entry' })
  retryGlForOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.retryGlForOrder(user.tenantId, id, user.id);
  }

  // ─── Phase 70: BOM Standard Cost Roll-up ─────────────────────────
  @Post('costing-runs')
  @RequirePermission('manufacturing:manage')
  rollupCost(@CurrentUser() user: any, @Body() body: { bomId: string; runDate?: string }) {
    return this.service.rollupStandardCost(user.tenantId, body.bomId, body.runDate);
  }

  @Get('costing-runs')
  @RequirePermission('manufacturing:read')
  listCostingRuns(@CurrentUser() user: any, @Query() pagination: any) {
    return this.service.listCostingRuns(user.tenantId, pagination);
  }

  // ─── Phase 78: Finite Capacity Scheduling ─────────────────────────
  @Post('production-orders/:id/schedule')
  @RequirePermission('manufacturing:manage')
  scheduleOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.fcsService.scheduleOrder(user.tenantId, id);
  }

  @Get('production-orders/:id/slots')
  @RequirePermission('manufacturing:read')
  getOrderSlots(@CurrentUser() user: any, @Param('id') id: string) {
    return this.fcsService.getOrderSlots(user.tenantId, id);
  }

  @Get('fcs/capacity-load')
  @RequirePermission('manufacturing:read')
  getFcsCapacityLoad(
    @CurrentUser() user: any,
    @Query('workCenterId') workCenterId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.fcsService.getCapacityLoad(user.tenantId, workCenterId, from, to);
  }

  @Get('fcs/capacity-load/all')
  @RequirePermission('manufacturing:read')
  getAllCapacityLoads(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.fcsService.listAllCapacityLoads(user.tenantId, from, to);
  }

  @Patch('capacity-slots/:id/status')
  @RequirePermission('manufacturing:manage')
  updateSlotStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { status: SlotStatus },
  ) {
    return this.fcsService.updateSlotStatus(user.tenantId, id, body.status);
  }
}
