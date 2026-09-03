import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { GenealogyService } from './genealogy.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('inventory-genealogy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('inventory/genealogy')
export class GenealogyController {
  constructor(private readonly service: GenealogyService) {}

  // ─── Ph-141: capture ──────────────────────────────────────────────
  @Get('edges')
  @RequirePermission('inventory:read')
  @ApiQuery({ name: 'parentLotId', required: false })
  @ApiQuery({ name: 'childLotId', required: false })
  listEdges(@CurrentUser() u: any, @Query('parentLotId') parentLotId?: string, @Query('childLotId') childLotId?: string) {
    return this.service.listEdges(u.tenantId, { parentLotId, childLotId });
  }

  @Post('edges')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Record a parent→child lot genealogy edge' })
  recordEdge(@CurrentUser() u: any, @Body() b: any) {
    return this.service.recordEdge(u.tenantId, b);
  }

  @Post('production')
  @RequirePermission('inventory:manage')
  @ApiOperation({ summary: 'Record production completion (parent lot consumed component lots)' })
  recordProduction(@CurrentUser() u: any, @Body() b: any) {
    return this.service.recordProduction(u.tenantId, b);
  }

  // ─── Ph-143: backward trace ───────────────────────────────────────
  @Get('backward/:lotId')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Backward trace: component lots that make up this lot' })
  backward(@CurrentUser() u: any, @Param('lotId') lotId: string) {
    return this.service.backwardTrace(u.tenantId, lotId);
  }

  // ─── Ph-142: forward trace ────────────────────────────────────────
  @Get('forward/:lotId')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Forward trace: finished-good lots that consumed this lot' })
  forward(@CurrentUser() u: any, @Param('lotId') lotId: string) {
    return this.service.forwardTrace(u.tenantId, lotId);
  }

  // ─── Ph-144: recall impact ────────────────────────────────────────
  @Get('recall/:lotId')
  @RequirePermission('inventory:read')
  @ApiOperation({ summary: 'Recall impact: all downstream and finished-good lots affected' })
  recall(@CurrentUser() u: any, @Param('lotId') lotId: string) {
    return this.service.recallImpact(u.tenantId, lotId);
  }
}
