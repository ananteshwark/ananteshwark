import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WmsService } from './wms.service';
import { PutawayService } from './putaway.service';
import { PickingService } from './picking.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TaskStatus, TaskType } from './entities/warehouse-task.entity';
import { WaveStatus, PickStrategy } from './entities/pick-wave.entity';

@ApiTags('wms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/wms')
export class WmsController {
  constructor(
    private readonly wmsService: WmsService,
    private readonly putawayService: PutawayService,
    private readonly pickingService: PickingService,
  ) {}

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
  @ApiOperation({ summary: 'Suggest putaway bin (legacy — no rules)' })
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

  // ─── Putaway Rules (Phase 92) ─────────────────────────────────────
  @Get('putaway-rules')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'List putaway strategy rules' })
  listPutawayRules(@CurrentUser() user: any, @Query('warehouseId') warehouseId?: string) {
    return this.putawayService.listRules(user.tenantId, warehouseId);
  }

  @Post('putaway-rules')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Create a putaway strategy rule' })
  createPutawayRule(@CurrentUser() user: any, @Body() body: any) {
    return this.putawayService.createRule(user.tenantId, body);
  }

  @Delete('putaway-rules/:id')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Delete a putaway rule' })
  deletePutawayRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.putawayService.deleteRule(user.tenantId, id);
  }

  @Post('putaway-suggest')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Suggest putaway bins using strategy rules' })
  suggestPutaway(
    @CurrentUser() user: any,
    @Body() body: { warehouseId: string; itemId: string; itemCategoryId?: string; qty: number },
  ) {
    return this.putawayService.suggestPutaway(
      user.tenantId, body.warehouseId, body.itemId, body.itemCategoryId ?? null, body.qty,
    );
  }

  // ─── Pick Suggestions (Phase 92) ─────────────────────────────────
  @Get('pick-suggest')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Directed pick suggestions (FIFO / FEFO / ZONE)' })
  suggestPicks(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId: string,
    @Query('itemId') itemId: string,
    @Query('qty') qty: string,
    @Query('strategy') strategy: PickStrategy = PickStrategy.FEFO,
  ) {
    return this.pickingService.suggestPicks(user.tenantId, warehouseId, itemId, Number(qty), strategy);
  }

  // ─── Pick Waves (Phase 92) ────────────────────────────────────────
  @Get('waves')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'List pick waves' })
  listWaves(
    @CurrentUser() user: any,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: WaveStatus,
  ) {
    return this.pickingService.listWaves(user.tenantId, { warehouseId, status });
  }

  @Post('waves')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Create a pick wave' })
  createWave(@CurrentUser() user: any, @Body() body: any) {
    return this.pickingService.createWave(user.tenantId, body);
  }

  @Get('waves/:id')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Get a pick wave with its tasks' })
  getWave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pickingService.getWave(user.tenantId, id);
  }

  @Post('waves/:id/tasks')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Add pick tasks to a wave' })
  addTasksToWave(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { taskIds: string[] }) {
    return this.pickingService.addTasksToWave(user.tenantId, id, body.taskIds);
  }

  @Post('waves/:id/release')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Release a pick wave (sets tasks to IN_PROGRESS)' })
  releaseWave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pickingService.releaseWave(user.tenantId, id);
  }

  @Post('waves/:id/complete')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Complete a pick wave' })
  completeWave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pickingService.completeWave(user.tenantId, id);
  }

  @Post('waves/:id/cancel')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Cancel a pick wave' })
  cancelWave(@CurrentUser() user: any, @Param('id') id: string) {
    return this.pickingService.cancelWave(user.tenantId, id);
  }
}
