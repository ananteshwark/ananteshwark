import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('security')
export class SecurityController {
  constructor(private readonly service: SecurityService) {}

  // ─── Ph-273: MFA ──────────────────────────────────────────────────
  @Post('mfa/enroll')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Enroll TOTP MFA (returns secret + otpauth URI)' })
  enroll(@CurrentUser() u: any) { return this.service.enrollTotp(u.tenantId, u.id); }

  @Post('mfa/verify')
  @RequirePermission('dashboard:read')
  @ApiOperation({ summary: 'Verify a TOTP code to activate enrollment' })
  verify(@CurrentUser() u: any, @Body() b: { code: string; at: string }) { return this.service.verifyEnrollment(u.tenantId, u.id, b.code, new Date(b.at).getTime()); }

  // ─── Ph-274: IP allowlist ─────────────────────────────────────────
  @Get('ip-allowlist')
  @RequirePermission('admin:read')
  listAllowlist(@CurrentUser() u: any) { return this.service.listAllowlist(u.tenantId); }

  @Post('ip-allowlist')
  @RequirePermission('admin:manage')
  addAllowlist(@CurrentUser() u: any, @Body() b: any) { return this.service.addAllowlist(u.tenantId, b); }

  @Get('ip-check')
  @RequirePermission('admin:read')
  @ApiQuery({ name: 'ip', required: true })
  ipCheck(@CurrentUser() u: any, @Query('ip') ip: string) { return this.service.isIpAllowed(u.tenantId, ip); }

  // ─── Ph-275: sessions ─────────────────────────────────────────────
  @Post('sessions')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Record a session (flags anomalies)' })
  recordSession(@CurrentUser() u: any, @Body() b: any) { return this.service.recordSession(u.tenantId, b); }

  @Get('sessions')
  @RequirePermission('admin:read')
  @ApiQuery({ name: 'userId', required: false })
  listSessions(@CurrentUser() u: any, @Query('userId') userId?: string) { return this.service.listSessions(u.tenantId, userId); }

  @Post('sessions/:id/revoke')
  @RequirePermission('admin:manage')
  revoke(@CurrentUser() u: any, @Param('id') id: string) { return this.service.revokeSession(u.tenantId, id); }

  // ─── Ph-276: field encryption ─────────────────────────────────────
  @Post('encrypt')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Encrypt a PII value with the per-tenant key' })
  encrypt(@CurrentUser() u: any, @Body() b: { value: string }) { return { token: this.service.encryptField(u.tenantId, b.value) }; }

  @Post('decrypt')
  @RequirePermission('admin:manage')
  decrypt(@CurrentUser() u: any, @Body() b: { token: string }) { return { value: this.service.decryptField(u.tenantId, b.token) }; }
}
