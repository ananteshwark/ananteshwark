import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CreateTenantDto, UpdateTenantDto, AllocateLicenseDto, UpdateLicenseDto } from './dto/admin.dto';
import { TenantStatus } from '../tenants/entities/tenant.entity';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---- Tenants ----
  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with license + user counts (super admin)' })
  listTenants() {
    return this.adminService.listTenants();
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.adminService.getTenant(id);
  }

  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @Patch('tenants/:id')
  updateTenant(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.adminService.updateTenant(id, dto);
  }

  @Patch('tenants/:id/suspend')
  suspendTenant(@Param('id') id: string) {
    return this.adminService.setTenantStatus(id, TenantStatus.SUSPENDED);
  }

  @Patch('tenants/:id/activate')
  activateTenant(@Param('id') id: string) {
    return this.adminService.setTenantStatus(id, TenantStatus.ACTIVE);
  }

  // ---- License allocation ----
  @Post('tenants/:id/license')
  @ApiOperation({ summary: 'Allocate or update the license for a tenant' })
  allocateLicense(@Param('id') id: string, @Body() dto: AllocateLicenseDto) {
    return this.adminService.allocateLicense(id, dto);
  }

  @Patch('tenants/:id/license')
  updateLicense(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.adminService.updateLicense(id, dto);
  }

  @Delete('tenants/:id/license')
  @ApiOperation({ summary: 'Suspend a tenant license' })
  revokeLicense(@Param('id') id: string) {
    return this.adminService.revokeLicense(id);
  }
}
