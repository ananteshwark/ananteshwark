import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ZxTaxService, TaxContext } from './zx-tax.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZxPartyType } from './entities/zx-registration.entity';

@ApiTags('finance-tax-engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('finance/tax-engine')
export class ZxTaxController {
  constructor(private readonly zx: ZxTaxService) {}

  // ─── Ph-121: Hierarchy ────────────────────────────────────────────
  @Get('regimes') @RequirePermission('finance:tax:read')
  listRegimes(@CurrentUser() u: any) { return this.zx.listRegimes(u.tenantId); }

  @Post('regimes') @RequirePermission('finance:tax:manage')
  createRegime(@CurrentUser() u: any, @Body() b: any) { return this.zx.createRegime(u.tenantId, b); }

  @Get('regimes/:id/taxes') @RequirePermission('finance:tax:read')
  listTaxes(@CurrentUser() u: any, @Param('id') id: string) { return this.zx.listTaxes(u.tenantId, id); }

  @Post('taxes') @RequirePermission('finance:tax:manage')
  createTax(@CurrentUser() u: any, @Body() b: any) { return this.zx.createTax(u.tenantId, b); }

  @Get('taxes/:id/statuses') @RequirePermission('finance:tax:read')
  listStatuses(@CurrentUser() u: any, @Param('id') id: string) { return this.zx.listStatuses(u.tenantId, id); }

  @Post('statuses') @RequirePermission('finance:tax:manage')
  createStatus(@CurrentUser() u: any, @Body() b: any) { return this.zx.createStatus(u.tenantId, b); }

  @Get('statuses/:id/rates') @RequirePermission('finance:tax:read')
  listRates(@CurrentUser() u: any, @Param('id') id: string) { return this.zx.listRates(u.tenantId, id); }

  @Post('rates') @RequirePermission('finance:tax:manage')
  createRate(@CurrentUser() u: any, @Body() b: any) { return this.zx.createRate(u.tenantId, b); }

  // ─── Ph-122: Rules ────────────────────────────────────────────────
  @Get('rules') @RequirePermission('finance:tax:read')
  @ApiQuery({ name: 'regimeId', required: false })
  listRules(@CurrentUser() u: any, @Query('regimeId') regimeId?: string) { return this.zx.listRules(u.tenantId, regimeId); }

  @Post('rules') @RequirePermission('finance:tax:manage')
  createRule(@CurrentUser() u: any, @Body() b: any) { return this.zx.createRule(u.tenantId, b); }

  @Delete('rules/:id') @RequirePermission('finance:tax:manage')
  deleteRule(@CurrentUser() u: any, @Param('id') id: string) { return this.zx.deleteRule(u.tenantId, id); }

  // ─── Ph-123: Registrations ────────────────────────────────────────
  @Get('registrations') @RequirePermission('finance:tax:read')
  @ApiQuery({ name: 'partyType', required: false }) @ApiQuery({ name: 'partyId', required: false })
  listRegistrations(@CurrentUser() u: any, @Query('partyType') partyType?: ZxPartyType, @Query('partyId') partyId?: string) {
    return this.zx.listRegistrations(u.tenantId, { partyType, partyId });
  }

  @Post('registrations') @RequirePermission('finance:tax:manage')
  createRegistration(@CurrentUser() u: any, @Body() b: any) { return this.zx.createRegistration(u.tenantId, b); }

  // ─── Determination ────────────────────────────────────────────────
  @Post('determine') @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'Determine applicable taxes for a transaction context' })
  determine(@CurrentUser() u: any, @Body() b: { regimeCode: string; context: TaxContext }) {
    return this.zx.determineTax(u.tenantId, b.regimeCode, b.context);
  }

  // ─── Ph-124: Reporting ────────────────────────────────────────────
  @Get('reports/return-summary') @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'VAT/GST return summary (output vs input, net payable)' })
  returnSummary(@CurrentUser() u: any, @Query('from') from: string, @Query('to') to: string) {
    return this.zx.taxReturnSummary(u.tenantId, from, to);
  }

  @Get('reports/gstr3b') @RequirePermission('finance:tax:read')
  @ApiOperation({ summary: 'GSTR-3B style summary (India)' })
  gstr3b(@CurrentUser() u: any, @Query('from') from: string, @Query('to') to: string) {
    return this.zx.gstr3bSummary(u.tenantId, from, to);
  }
}
