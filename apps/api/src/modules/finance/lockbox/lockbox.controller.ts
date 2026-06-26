import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LockboxService, ApplyStrategy } from './lockbox.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { LockboxReceiptStatus } from './entities/lockbox-receipt.entity';

@ApiTags('finance-lockbox')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/lockbox')
export class LockboxController {
  constructor(private readonly lockboxService: LockboxService) {}

  @Get('batches')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'List lockbox import batches' })
  listBatches(@CurrentUser() user: any) {
    return this.lockboxService.listBatches(user.tenantId);
  }

  @Post('batches/import')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Import a lockbox file (MT940 / BAI2 / NORMALIZED)' })
  importBatch(@CurrentUser() user: any, @Body() body: any) {
    return this.lockboxService.importBatch(user.tenantId, body);
  }

  @Post('batches/:id/apply')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Auto-apply a batch (OLDEST_FIRST / EXACT_MATCH / BY_REFERENCE)' })
  applyBatch(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { strategy: ApplyStrategy }) {
    return this.lockboxService.applyBatch(user.tenantId, id, body.strategy ?? 'OLDEST_FIRST', user.id);
  }

  @Get('receipts')
  @RequirePermission('finance:ar:read')
  @ApiQuery({ name: 'batchId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listReceipts(
    @CurrentUser() user: any,
    @Query('batchId') batchId?: string,
    @Query('status') status?: LockboxReceiptStatus,
  ) {
    return this.lockboxService.listReceipts(user.tenantId, { batchId, status });
  }

  @Get('receipts/unapplied')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Unapplied receipt queue' })
  listUnapplied(@CurrentUser() user: any) {
    return this.lockboxService.listUnapplied(user.tenantId);
  }

  @Patch('receipts/:id/assign-customer')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Assign a customer to an unmatched receipt' })
  assignCustomer(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { customerId: string }) {
    return this.lockboxService.assignCustomer(user.tenantId, id, body.customerId);
  }

  @Post('receipts/:id/apply')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Manually apply a single receipt' })
  manualApply(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { strategy: ApplyStrategy }) {
    return this.lockboxService.manualApply(user.tenantId, id, body.strategy ?? 'OLDEST_FIRST', user.id);
  }
}
