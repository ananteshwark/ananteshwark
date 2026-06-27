import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OpQualityService } from './op-quality.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('manufacturing-quality')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('manufacturing/op-quality')
export class OpQualityController {
  constructor(private readonly service: OpQualityService) {}

  // ─── Ph-155: plans ────────────────────────────────────────────────
  @Get('plans')
  @RequirePermission('manufacturing:read')
  @ApiQuery({ name: 'routingOperationId', required: false })
  listPlans(@CurrentUser() u: any, @Query('routingOperationId') routingOperationId?: string) {
    return this.service.listPlans(u.tenantId, routingOperationId);
  }

  @Post('plans')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Define a quality plan on a routing operation' })
  createPlan(@CurrentUser() u: any, @Body() b: any) {
    return this.service.createPlan(u.tenantId, b);
  }

  @Delete('plans/:id')
  @RequirePermission('manufacturing:manage')
  deletePlan(@CurrentUser() u: any, @Param('id') id: string) {
    return this.service.deletePlan(u.tenantId, id);
  }

  // ─── Ph-156: collection + move gate ───────────────────────────────
  @Post('collect')
  @RequirePermission('manufacturing:manage')
  @ApiOperation({ summary: 'Collect in-process measurements; blocks move on required failure' })
  collect(@CurrentUser() u: any, @Body() b: any) {
    return this.service.collect(u.tenantId, { ...b, recordedById: u.id });
  }

  @Get('can-proceed')
  @RequirePermission('manufacturing:read')
  @ApiOperation({ summary: 'Check whether an operation may move to the next step' })
  canProceed(@CurrentUser() u: any, @Query('productionOrderId') poId: string, @Query('routingOperationId') opId: string) {
    return this.service.canProceed(u.tenantId, poId, opId);
  }

  @Get('results')
  @RequirePermission('manufacturing:read')
  listResults(@CurrentUser() u: any, @Query('productionOrderId') poId: string) {
    return this.service.listResults(u.tenantId, poId);
  }

  // ─── Ph-158: first-pass yield ─────────────────────────────────────
  @Get('first-pass-yield')
  @RequirePermission('manufacturing:read')
  @ApiOperation({ summary: 'First-pass yield by work center' })
  @ApiQuery({ name: 'workCenterId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  fpy(@CurrentUser() u: any, @Query('workCenterId') workCenterId?: string, @Query('itemId') itemId?: string) {
    return this.service.firstPassYield(u.tenantId, { workCenterId, itemId });
  }
}
