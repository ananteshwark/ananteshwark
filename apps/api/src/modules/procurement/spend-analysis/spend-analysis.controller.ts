import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SpendAnalysisService } from './spend-analysis.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('procurement-spend')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('procurement/spend-analysis')
export class SpendAnalysisController {
  constructor(private readonly service: SpendAnalysisService) {}

  // ─── Ph-206: spend cube ───────────────────────────────────────────
  @Post('spend')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Ingest/accumulate a spend cube cell' })
  upsertSpend(@CurrentUser() u: any, @Body() b: any) { return this.service.upsertSpend(u.tenantId, b); }

  @Post('rebuild')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Rebuild committed spend from purchase orders' })
  rebuild(@CurrentUser() u: any) { return this.service.rebuildFromPurchaseOrders(u.tenantId); }

  @Get('cube')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'groupBy', required: false, enum: ['supplier', 'category', 'costCenter', 'period'] })
  @ApiQuery({ name: 'period', required: false })
  cube(@CurrentUser() u: any, @Query('groupBy') groupBy?: any, @Query('period') period?: string) {
    return this.service.queryCube(u.tenantId, { groupBy, period });
  }

  // ─── Ph-207: savings ──────────────────────────────────────────────
  @Post('savings')
  @RequirePermission('procurement:manage')
  @ApiOperation({ summary: 'Log a negotiated-vs-market savings entry' })
  logSavings(@CurrentUser() u: any, @Body() b: any) { return this.service.logSavings(u.tenantId, b); }

  @Get('savings')
  @RequirePermission('procurement:read')
  @ApiQuery({ name: 'period', required: false })
  savings(@CurrentUser() u: any, @Query('period') period?: string) { return this.service.savingsSummary(u.tenantId, period); }

  // ─── Ph-208: maverick detection ───────────────────────────────────
  @Post('maverick')
  @RequirePermission('procurement:read')
  @ApiOperation({ summary: 'Detect maverick spend (no requisition / unapproved vendor)' })
  maverick(@CurrentUser() u: any, @Body() b: { approvedVendorIds?: string[] }) {
    return this.service.detectMaverick(u.tenantId, b?.approvedVendorIds ?? []);
  }
}
