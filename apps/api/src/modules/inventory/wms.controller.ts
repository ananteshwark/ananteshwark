import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WmsService } from './wms.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskStatus, TaskType } from './entities/warehouse-task.entity';

@ApiTags('wms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/wms')
export class WmsController {
  constructor(private readonly wmsService: WmsService) {}

  // ─── Batch Management ─────────────────────────────────────────────
  @Get('batch/:lotSerialId/characteristics')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Get quality characteristics for a batch/lot' })
  getBatchCharacteristics(@CurrentUser() user: any, @Param('lotSerialId') lotSerialId: string) {
    return this.wmsService.getBatchCharacteristics(user.tenantId, lotSerialId);
  }

  @Post('batch/:lotSerialId/characteristics')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Record quality characteristics for a batch' })
  recordBatchCharacteristics(
    @CurrentUser() user: any,
    @Param('lotSerialId') lotSerialId: string,
    @Body() body: { characteristics: any[] },
  ) {
    return this.wmsService.recordBatchCharacteristics(user.tenantId, lotSerialId, body.characteristics);
  }

  @Post('batch/:lotSerialId/release')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Release a batch from quarantine (checks no FAIL characteristics)' })
  releaseBatch(@CurrentUser() user: any, @Param('lotSerialId') lotSerialId: string) {
    return this.wmsService.releaseBatch(user.tenantId, lotSerialId);
  }

  @Post('batch/:lotSerialId/quarantine')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Quarantine an active batch' })
  quarantineBatch(@CurrentUser() user: any, @Param('lotSerialId') lotSerialId: string) {
    return this.wmsService.quarantineBatch(user.tenantId, lotSerialId);
  }

  @Get('batch/fefo-suggestion')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'FEFO pick suggestion for an item in a warehouse' })
  fefoPickSuggestion(
    @CurrentUser() user: any,
    @Query('itemId') itemId: string,
    @Query('warehouseId') warehouseId: string,
    @Query('qty') qty: string,
  ) {
    return this.wmsService.fefoPickSuggestion(user.tenantId, itemId, warehouseId, Number(qty));
  }

  // ─── Bin Stock ────────────────────────────────────────────────────
  @Get('bin-stock')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Get bin-level stock balances' })
  getBinStock(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('binLocationId') binLocationId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.wmsService.getBinStock(user.tenantId, { warehouseId, binLocationId, itemId });
  }

  @Post('bin-stock/suggest-putaway')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Suggest putaway bin for an item' })
  suggestPutawayBin(
    @CurrentUser() user: any,
    @Body() body: { warehouseId: string; itemId: string; qty: number },
  ) {
    return this.wmsService.suggestPutawayBin(user.tenantId, body.warehouseId, body.itemId, body.qty);
  }

  // ─── Warehouse Tasks ──────────────────────────────────────────────
  @Get('tasks')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'List warehouse tasks' })
  listTasks(
    @CurrentUser() user: any,
    @Query('status') status?: TaskStatus,
    @Query('taskType') taskType?: TaskType,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.wmsService.listTasks(user.tenantId, { status, taskType, warehouseId });
  }

  @Get('tasks/:id')
  @RequirePermission('inventory:read')
  getTask(@CurrentUser() user: any, @Param('id') id: string) {
    return this.wmsService.getTask(user.tenantId, id);
  }

  @Post('tasks')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Create a warehouse task (PUTAWAY/PICK/MOVE/REPLENISH)' })
  createTask(@CurrentUser() user: any, @Body() body: any) {
    return this.wmsService.createTask(user.tenantId, body);
  }

  @Patch('tasks/:id/assign')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Assign a task to a user' })
  assignTask(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { userId?: string },
  ) {
    return this.wmsService.assignTask(user.tenantId, id, body.userId ?? user.id);
  }

  @Post('tasks/:id/complete')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Complete a warehouse task (updates bin stock)' })
  completeTask(@CurrentUser() user: any, @Param('id') id: string) {
    return this.wmsService.completeTask(user.tenantId, id);
  }

  @Post('tasks/:id/cancel')
  @RequirePermission('inventory:manage')
  cancelTask(@CurrentUser() user: any, @Param('id') id: string) {
    return this.wmsService.cancelTask(user.tenantId, id);
  }
}
