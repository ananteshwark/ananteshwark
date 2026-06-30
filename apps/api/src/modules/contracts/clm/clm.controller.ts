import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ClmService } from './clm.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DeviationStatus } from './entities/clause-deviation.entity';

@ApiTags('contracts-clm')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('contracts/clm')
export class ClmController {
  constructor(private readonly service: ClmService) {}

  // ─── Ph-209: clause library ───────────────────────────────────────
  @Get('clauses')
  @RequirePermission('contracts:read')
  @ApiQuery({ name: 'approvedOnly', required: false })
  listClauses(@CurrentUser() u: any, @Query('approvedOnly') approvedOnly?: string) { return this.service.listClauses(u.tenantId, approvedOnly === 'true'); }

  @Post('clauses')
  @RequirePermission('contracts:manage')
  createClause(@CurrentUser() u: any, @Body() b: any) { return this.service.createClause(u.tenantId, b); }

  @Post('clauses/:id/approve')
  @RequirePermission('contracts:manage')
  approveClause(@CurrentUser() u: any, @Param('id') id: string) { return this.service.approveClause(u.tenantId, id); }

  @Post('assemble')
  @RequirePermission('contracts:manage')
  @ApiOperation({ summary: 'Assemble a contract body from approved clauses' })
  assemble(@CurrentUser() u: any, @Body() b: { clauseCodes: string[] }) { return this.service.assemble(u.tenantId, b.clauseCodes); }

  // ─── Ph-210: deviations ───────────────────────────────────────────
  @Post('deviations')
  @RequirePermission('contracts:manage')
  @ApiOperation({ summary: 'Record a non-standard clause; routes to legal' })
  recordDeviation(@CurrentUser() u: any, @Body() b: any) { return this.service.recordDeviation(u.tenantId, b); }

  @Get('deviations')
  @RequirePermission('contracts:read')
  @ApiQuery({ name: 'contractId', required: false })
  @ApiQuery({ name: 'status', required: false })
  listDeviations(@CurrentUser() u: any, @Query('contractId') contractId?: string, @Query('status') status?: DeviationStatus) {
    return this.service.listDeviations(u.tenantId, contractId, status);
  }

  @Post('deviations/:id/review')
  @RequirePermission('contracts:manage')
  review(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { decision: 'APPROVE' | 'REJECT'; notes?: string }) {
    return this.service.reviewDeviation(u.tenantId, id, u.id, b.decision, b.notes);
  }

  // ─── Ph-212: e-signature ──────────────────────────────────────────
  @Post('envelopes')
  @RequirePermission('contracts:manage')
  @ApiOperation({ summary: 'Create an e-signature envelope' })
  createEnvelope(@CurrentUser() u: any, @Body() b: any) { return this.service.createEnvelope(u.tenantId, b); }

  @Post('envelopes/:id/send')
  @RequirePermission('contracts:manage')
  sendEnvelope(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { sentAt: string; externalId?: string }) {
    return this.service.sendEnvelope(u.tenantId, id, b.sentAt, b.externalId);
  }

  @Post('envelopes/:id/signature')
  @RequirePermission('contracts:manage')
  @ApiOperation({ summary: 'Provider callback: signer signed/declined' })
  updateSignature(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.updateSignature(u.tenantId, id, b); }

  @Get('envelopes')
  @RequirePermission('contracts:read')
  @ApiQuery({ name: 'contractId', required: true })
  listEnvelopes(@CurrentUser() u: any, @Query('contractId') contractId: string) { return this.service.listEnvelopes(u.tenantId, contractId); }

  // ─── Ph-213: renewal ──────────────────────────────────────────────
  @Get('renewal-alerts')
  @RequirePermission('contracts:read')
  @ApiOperation({ summary: 'Contracts approaching expiry (90/60/30 buckets)' })
  @ApiQuery({ name: 'asOf', required: true })
  renewalAlerts(@CurrentUser() u: any, @Query('asOf') asOf: string) { return this.service.renewalAlerts(u.tenantId, asOf); }

  @Post('contracts/:id/renew')
  @RequirePermission('contracts:manage')
  initiateRenewal(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { newEndDate: string }) {
    return this.service.initiateRenewal(u.tenantId, id, b.newEndDate);
  }
}
