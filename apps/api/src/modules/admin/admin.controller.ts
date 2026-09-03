import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { TenantExportService } from './tenant-export.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import {
  CreateTenantDto,
  UpdateTenantDto,
  AllocateLicenseDto,
  UpdateLicenseDto,
  AddTenantAdminDto,
  UpdateTenantAdminDto,
} from './dto/admin.dto';
import { TenantStatus } from '../tenants/entities/tenant.entity';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService,
    private readonly tenantExportService: TenantExportService,
  ) {}

  // ---- Tenants ----
  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with license + user counts (super admin)' })
  @ApiQuery({ name: 'includeHidden', required: false, type: Boolean })
  listTenants(@Query('includeHidden') includeHidden?: string) {
    return this.adminService.listTenants(includeHidden === 'true');
  }

  @Get('tenants/:id/export')
  @ApiOperation({ summary: 'Full portable export of a tenant (every tenant-scoped table)' })
  exportTenant(@Param('id') id: string) {
    return this.tenantExportService.export(id);
  }

  @Get('tenants/:id/export/summary')
  @ApiOperation({ summary: 'Row counts per table for a tenant export' })
  exportSummary(@Param('id') id: string) {
    return this.tenantExportService.summary(id);
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

  @Patch('tenants/:id/hide')
  @ApiOperation({ summary: 'Hide a tenant from the management list' })
  hideTenant(@Param('id') id: string) {
    return this.adminService.setTenantHidden(id, true);
  }

  @Patch('tenants/:id/unhide')
  @ApiOperation({ summary: 'Unhide a previously hidden tenant' })
  unhideTenant(@Param('id') id: string) {
    return this.adminService.setTenantHidden(id, false);
  }

  // ---- Tenant admins ----
  @Post('tenants/:id/admins')
  @ApiOperation({ summary: 'Add a new tenant admin user to a tenant' })
  addTenantAdmin(@Param('id') id: string, @Body() dto: AddTenantAdminDto) {
    return this.adminService.addTenantAdmin(id, dto);
  }

  @Patch('tenants/:id/admins/:userId')
  @ApiOperation({ summary: 'Edit a tenant admin (name / phone / password)' })
  updateTenantAdmin(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateTenantAdminDto,
  ) {
    return this.adminService.updateTenantAdmin(id, userId, dto);
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
