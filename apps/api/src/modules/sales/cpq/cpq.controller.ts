import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CpqService } from './cpq.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('sales-cpq')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/cpq')
export class CpqController {
  constructor(private readonly service: CpqService) {}

  // ─── Ph-220: configurator ─────────────────────────────────────────
  @Get('models')
  @RequirePermission('sales:read')
  listModels(@CurrentUser() u: any) { return this.service.listModels(u.tenantId); }

  @Post('models')
  @RequirePermission('sales:manage')
  createModel(@CurrentUser() u: any, @Body() b: any) { return this.service.createModel(u.tenantId, b); }

  @Post('validate')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Validate a configuration and compute its price' })
  validate(@CurrentUser() u: any, @Body() b: { modelCode: string; selectedOptions: string[] }) {
    return this.service.validateConfiguration(u.tenantId, b.modelCode, b.selectedOptions ?? []);
  }

  // ─── Ph-221: pricing + quote ──────────────────────────────────────
  @Post('quotes')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Create a priced quote (applies the pricing waterfall)' })
  createQuote(@CurrentUser() u: any, @Body() b: any) { return this.service.createQuote(u.tenantId, b); }

  @Get('quotes')
  @RequirePermission('sales:read')
  listQuotes(@CurrentUser() u: any) { return this.service.listQuotes(u.tenantId); }

  @Post('quotes/:id/submit')
  @RequirePermission('sales:manage')
  submit(@CurrentUser() u: any, @Param('id') id: string) { return this.service.submitForApproval(u.tenantId, id); }

  @Post('quotes/:id/decision')
  @RequirePermission('sales:manage')
  decide(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { decision: 'APPROVE' | 'REJECT' }) {
    return this.service.decide(u.tenantId, id, b.decision);
  }

  // ─── Ph-222: guided selling ───────────────────────────────────────
  @Post('questionnaires')
  @RequirePermission('sales:manage')
  createQuestionnaire(@CurrentUser() u: any, @Body() b: any) { return this.service.createQuestionnaire(u.tenantId, b); }

  @Post('recommend')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Recommend a product model from guided answers' })
  recommend(@CurrentUser() u: any, @Body() b: { code: string; answers: any[] }) {
    return this.service.recommend(u.tenantId, b.code, b.answers);
  }

  // ─── Ph-223: quote document ───────────────────────────────────────
  @Get('quotes/:id/document')
  @RequirePermission('sales:read')
  @ApiOperation({ summary: 'Branded quote document (PDF source)' })
  document(@CurrentUser() u: any, @Param('id') id: string) { return this.service.quoteDocument(u.tenantId, id); }

  // ─── Ph-224: quote-to-order ───────────────────────────────────────
  @Post('quotes/:id/convert')
  @RequirePermission('sales:manage')
  @ApiOperation({ summary: 'Convert an approved quote into a sales order' })
  convert(@CurrentUser() u: any, @Param('id') id: string) { return this.service.convertToOrder(u.tenantId, id); }
}
