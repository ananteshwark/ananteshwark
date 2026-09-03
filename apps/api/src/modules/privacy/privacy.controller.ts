import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PrivacyService } from './privacy.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('privacy')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('privacy')
export class PrivacyController {
  constructor(private readonly service: PrivacyService) {}

  // ─── Ph-269: PII inventory ────────────────────────────────────────
  @Get('pii-fields')
  @RequirePermission('admin:read')
  @ApiQuery({ name: 'entityName', required: false })
  listPii(@CurrentUser() u: any, @Query('entityName') entityName?: string) { return this.service.listPiiFields(u.tenantId, entityName); }

  @Post('pii-fields')
  @RequirePermission('admin:manage')
  registerPii(@CurrentUser() u: any, @Body() b: any) { return this.service.registerPiiField(u.tenantId, b); }

  // ─── Ph-270: consent ──────────────────────────────────────────────
  @Post('consents')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Record/withdraw a consent for a purpose' })
  recordConsent(@CurrentUser() u: any, @Body() b: any) { return this.service.recordConsent(u.tenantId, b); }

  @Get('consents/:subjectId')
  @RequirePermission('admin:read')
  listConsents(@CurrentUser() u: any, @Param('subjectId') subjectId: string) { return this.service.listConsents(u.tenantId, subjectId); }

  @Get('consents/:subjectId/check')
  @RequirePermission('admin:read')
  @ApiQuery({ name: 'purpose', required: true })
  hasConsent(@CurrentUser() u: any, @Param('subjectId') subjectId: string, @Query('purpose') purpose: string) { return this.service.hasConsent(u.tenantId, subjectId, purpose); }

  // ─── Ph-271: erasure ──────────────────────────────────────────────
  @Post('erasure')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Request right-to-erasure with a retention date' })
  requestErasure(@CurrentUser() u: any, @Body() b: any) { return this.service.requestErasure(u.tenantId, b); }

  @Post('erasure/process')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Anonymize erasures past their retention period' })
  processErasures(@CurrentUser() u: any, @Body() b: { asOf: string }) { return this.service.processErasures(u.tenantId, b.asOf); }

  // ─── Ph-272: DSAR ─────────────────────────────────────────────────
  @Post('dsar')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Fulfil a Data Subject Access Request' })
  fulfilDsar(@CurrentUser() u: any, @Body() b: any) { return this.service.fulfilDsar(u.tenantId, u.id, b); }

  @Post('dsar/:id/access')
  @RequirePermission('admin:read')
  accessDsar(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { at: string }) { return this.service.accessDsar(u.tenantId, id, u.id, b.at); }
}
