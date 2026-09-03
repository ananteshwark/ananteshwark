import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CmmsService } from './cmms.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('maintenance-cmms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('maintenance/cmms')
export class CmmsController {
  constructor(private readonly service: CmmsService) {}

  // ─── Ph-164: parts ────────────────────────────────────────────────
  @Get('orders/:orderId/parts')
  @RequirePermission('maintenance:read')
  listParts(@CurrentUser() u: any, @Param('orderId') orderId: string) { return this.service.listParts(u.tenantId, orderId); }

  @Post('parts')
  @RequirePermission('maintenance:manage')
  @ApiOperation({ summary: 'Reserve a part for a work order' })
  reservePart(@CurrentUser() u: any, @Body() b: any) { return this.service.reservePart(u.tenantId, b); }

  @Post('parts/:id/issue')
  @RequirePermission('maintenance:manage')
  issuePart(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { qtyIssued?: number }) { return this.service.issuePart(u.tenantId, id, b?.qtyIssued); }

  @Post('parts/:id/cancel')
  @RequirePermission('maintenance:manage')
  cancelPart(@CurrentUser() u: any, @Param('id') id: string) { return this.service.cancelPart(u.tenantId, id); }

  @Post('orders/:orderId/issue-all-parts')
  @RequirePermission('maintenance:manage')
  @ApiOperation({ summary: 'Issue all reserved parts for a work order (on completion)' })
  issueAll(@CurrentUser() u: any, @Param('orderId') orderId: string) { return this.service.issueAllForOrder(u.tenantId, orderId); }

  // ─── Ph-166: warranty ─────────────────────────────────────────────
  @Get('warranties')
  @RequirePermission('maintenance:read')
  @ApiQuery({ name: 'equipmentId', required: false })
  listWarranties(@CurrentUser() u: any, @Query('equipmentId') equipmentId?: string) { return this.service.listWarranties(u.tenantId, equipmentId); }

  @Post('warranties')
  @RequirePermission('maintenance:manage')
  createWarranty(@CurrentUser() u: any, @Body() b: any) { return this.service.createWarranty(u.tenantId, b); }

  @Get('warranties/check')
  @RequirePermission('maintenance:read')
  @ApiOperation({ summary: 'Check if equipment is under warranty on a date' })
  check(@CurrentUser() u: any, @Query('equipmentId') equipmentId: string, @Query('onDate') onDate: string) {
    return this.service.isUnderWarranty(u.tenantId, equipmentId, onDate);
  }

  @Post('warranties/:id/claim')
  @RequirePermission('maintenance:manage')
  claim(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { amount: number }) { return this.service.recordClaim(u.tenantId, id, b.amount); }

  // ─── Ph-165: service history ──────────────────────────────────────
  @Get('equipment/:equipmentId/service-history')
  @RequirePermission('maintenance:read')
  @ApiOperation({ summary: 'Full service history + cost rollup for an asset' })
  serviceHistory(@CurrentUser() u: any, @Param('equipmentId') equipmentId: string) { return this.service.serviceHistory(u.tenantId, equipmentId); }
}
