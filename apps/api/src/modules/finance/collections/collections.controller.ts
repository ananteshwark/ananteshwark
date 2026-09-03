import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PromiseStatus } from './entities/promise-to-pay.entity';
import { DisputeStatus } from './entities/dispute.entity';

@ApiTags('finance-collections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  // ─── Workbench ────────────────────────────────────────────────────
  @Get('workbench')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Collections workbench — per-customer aging + activity summary' })
  @ApiQuery({ name: 'asOf', required: false })
  getWorkbench(@CurrentUser() user: any, @Query('asOf') asOf?: string) {
    return this.collectionsService.getWorkbench(user.tenantId, asOf);
  }

  @Get('customers/:id')
  @RequirePermission('finance:ar:read')
  @ApiOperation({ summary: 'Customer collections drill-down' })
  getCustomerDetail(@CurrentUser() user: any, @Param('id') id: string, @Query('asOf') asOf?: string) {
    return this.collectionsService.getCustomerDetail(user.tenantId, id, asOf);
  }

  @Post('notes')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Add a collection note / log contact' })
  addNote(@CurrentUser() user: any, @Body() body: any) {
    return this.collectionsService.addNote(user.tenantId, { ...body, collectorId: user.id });
  }

  // ─── Promise-to-pay ───────────────────────────────────────────────
  @Get('promises')
  @RequirePermission('finance:ar:read')
  listPromises(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('status') status?: PromiseStatus,
  ) {
    return this.collectionsService.listPromises(user.tenantId, { customerId, status });
  }

  @Post('promises')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Record a promise-to-pay' })
  createPromise(@CurrentUser() user: any, @Body() body: any) {
    return this.collectionsService.createPromise(user.tenantId, { ...body, collectorId: user.id });
  }

  @Patch('promises/:id/resolve')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Resolve a promise (KEPT / BROKEN / CANCELLED)' })
  resolvePromise(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { status: PromiseStatus; amountKept?: number }) {
    return this.collectionsService.resolvePromise(user.tenantId, id, body);
  }

  @Post('promises/sweep-broken')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Mark overdue open promises as broken' })
  sweepBroken(@CurrentUser() user: any, @Body() body: { asOf?: string }) {
    return this.collectionsService.sweepBrokenPromises(user.tenantId, body?.asOf);
  }

  // ─── Disputes ─────────────────────────────────────────────────────
  @Get('disputes')
  @RequirePermission('finance:ar:read')
  listDisputes(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('invoiceId') invoiceId?: string,
    @Query('status') status?: DisputeStatus,
  ) {
    return this.collectionsService.listDisputes(user.tenantId, { customerId, invoiceId, status });
  }

  @Post('disputes')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Raise a dispute against an invoice (suspends dunning)' })
  raiseDispute(@CurrentUser() user: any, @Body() body: any) {
    return this.collectionsService.raiseDispute(user.tenantId, { ...body, raisedById: user.id });
  }

  @Patch('disputes/:id')
  @RequirePermission('finance:ar:manage')
  @ApiOperation({ summary: 'Update dispute status (IN_REVIEW / RESOLVED / REJECTED)' })
  updateDispute(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.collectionsService.updateDisputeStatus(user.tenantId, id, { ...body, resolverId: user.id });
  }
}
