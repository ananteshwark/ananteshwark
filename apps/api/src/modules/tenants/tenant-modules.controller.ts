import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateTenantModulesDto } from './dto/create-tenant.dto';

// Tenant-scoped module management for tenant admins. Every operation acts on the
// caller's own tenant (from the JWT) and is bounded by the super admin's license.
@ApiTags('tenant-modules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('tenant/modules')
export class TenantModulesController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @RequirePermission('settings:modules:read')
  @ApiOperation({ summary: 'Licensed + currently-active modules for the current tenant' })
  get(@CurrentUser() user: any) {
    return this.tenantsService.getModuleConfig(user.tenantId);
  }

  @Patch()
  @RequirePermission('settings:modules:update')
  @ApiOperation({ summary: 'Enable/disable modules for the current tenant (within the license)' })
  update(@CurrentUser() user: any, @Body() dto: UpdateTenantModulesDto) {
    return this.tenantsService.setEnabledModules(user.tenantId, dto.enabledModules);
  }
}
