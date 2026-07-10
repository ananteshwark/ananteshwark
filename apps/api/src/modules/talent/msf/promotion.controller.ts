import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { PromotionService } from './promotion.service';
import { PromotionStatus } from './entities/promotion.entity';

@ApiTags('talent-promotion')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('talent/promotion')
export class PromotionController {
  constructor(private readonly service: PromotionService) {}

  // ---- Promotion cases ----
  @Get('cases')
  @RequirePermission('talent:promotion:read')
  listCases(@CurrentUser() user: any, @Query('status') status?: PromotionStatus) {
    return this.service.listCases(user.tenantId, status);
  }

  @Post('cases')
  @RequirePermission('talent:promotion:manage')
  createCase(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createCase(user.tenantId, dto);
  }

  @Get('cases/:id')
  @RequirePermission('talent:promotion:read')
  getCase(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getCase(user.tenantId, id);
  }

  @Put('cases/:id/score')
  @RequirePermission('talent:promotion:manage')
  @ApiOperation({ summary: 'Set weighted criteria and recompute the readiness score' })
  scoreCase(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { criteria: any[] }) {
    return this.service.scoreCase(user.tenantId, id, body?.criteria ?? []);
  }

  @Post('cases/:id/submit')
  @RequirePermission('talent:promotion:manage')
  submitForReview(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.submitForReview(user.tenantId, id);
  }

  @Post('cases/:id/decide')
  @RequirePermission('talent:promotion:approve')
  decide(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { approve: boolean; recommendation?: string; panelNotes?: string }) {
    return this.service.decide(user.tenantId, id, { ...body, decidedByUserId: user.id });
  }

  // ---- Achievement matrix (N-grid) ----
  @Get('matrices')
  @RequirePermission('talent:promotion:read')
  listMatrices(@CurrentUser() user: any) {
    return this.service.listMatrices(user.tenantId);
  }

  @Post('matrices')
  @RequirePermission('talent:promotion:manage')
  createMatrix(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createMatrix(user.tenantId, dto);
  }

  @Put('matrices/:id/cell')
  @RequirePermission('talent:promotion:manage')
  setCell(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { rowBand: string; colBand: string; recommendation: string; note?: string }) {
    return this.service.setCell(user.tenantId, id, body.rowBand, body.colBand, { recommendation: body.recommendation, note: body.note });
  }

  @Get('matrices/:id/place')
  @RequirePermission('talent:promotion:read')
  @ApiOperation({ summary: 'Resolve the recommendation for a row/col band placement' })
  place(@CurrentUser() user: any, @Param('id') id: string, @Query('rowBand') rowBand: string, @Query('colBand') colBand: string) {
    return this.service.placeOnMatrix(user.tenantId, id, rowBand, colBand);
  }
}
