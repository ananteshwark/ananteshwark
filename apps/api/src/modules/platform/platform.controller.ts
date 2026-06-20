import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateSsoProviderDto, CreateSodRuleDto, CreateTaxCodeDto, ComputeTaxDto, CreateRetentionPolicyDto } from './dto/platform.dto';

@ApiTags('platform')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly svc: PlatformService) {}

  // SSO
  @Get('sso-providers')
  @RequirePermission('platform:read')
  listSsoProviders(@CurrentUser() u: any) { return this.svc.listSsoProviders(u.tenantId); }

  @Post('sso-providers')
  @RequirePermission('platform:manage')
  createSsoProvider(@CurrentUser() u: any, @Body() dto: CreateSsoProviderDto) { return this.svc.createSsoProvider(u.tenantId, dto); }

  @Patch('sso-providers/:id/toggle')
  @RequirePermission('platform:manage')
  toggleSsoProvider(@CurrentUser() u: any, @Param('id') id: string) { return this.svc.toggleSsoProvider(u.tenantId, id); }

  // SoD
  @Get('sod-rules')
  @RequirePermission('platform:read')
  listSodRules(@CurrentUser() u: any) { return this.svc.listSodRules(u.tenantId); }

  @Post('sod-rules')
  @RequirePermission('platform:manage')
  createSodRule(@CurrentUser() u: any, @Body() dto: CreateSodRuleDto) { return this.svc.createSodRule(u.tenantId, dto); }

  @Get('sod-violations')
  @RequirePermission('platform:read')
  listViolations(@CurrentUser() u: any) { return this.svc.listViolations(u.tenantId); }

  @Post('sod-check/:userId')
  @RequirePermission('platform:manage')
  runSodCheck(@CurrentUser() u: any, @Param('userId') userId: string, @Body() body: { permissions: string[] }) {
    return this.svc.runSodCheck(u.tenantId, userId, body.permissions);
  }

  @Patch('sod-violations/:id/mitigate')
  @RequirePermission('platform:manage')
  mitigateViolation(@CurrentUser() u: any, @Param('id') id: string, @Body() body: { notes: string }) {
    return this.svc.mitigateViolation(u.tenantId, id, body.notes);
  }

  // Tax
  @Get('tax-codes')
  @RequirePermission('platform:read')
  listTaxCodes(@CurrentUser() u: any) { return this.svc.listTaxCodes(u.tenantId); }

  @Post('tax-codes')
  @RequirePermission('platform:manage')
  createTaxCode(@CurrentUser() u: any, @Body() dto: CreateTaxCodeDto) { return this.svc.createTaxCode(u.tenantId, dto); }

  @Post('tax-codes/compute')
  @RequirePermission('platform:read')
  computeTax(@CurrentUser() u: any, @Body() dto: ComputeTaxDto) { return this.svc.computeTax(u.tenantId, dto); }

  // Data Retention
  @Get('data-retention')
  @RequirePermission('platform:read')
  listRetentionPolicies(@CurrentUser() u: any) { return this.svc.listRetentionPolicies(u.tenantId); }

  @Post('data-retention')
  @RequirePermission('platform:manage')
  createRetentionPolicy(@CurrentUser() u: any, @Body() dto: CreateRetentionPolicyDto) { return this.svc.createRetentionPolicy(u.tenantId, dto); }
}
