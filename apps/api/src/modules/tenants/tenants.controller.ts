import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantSettingsDto } from './dto/create-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tenant (superadmin only)' })
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tenants' })
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tenant by ID' })
  findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Patch(':id/settings')
  @ApiOperation({ summary: 'Update tenant settings' })
  updateSettings(@Param('id') id: string, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantsService.updateSettings(id, dto);
  }

  @Patch(':id/suspend')
  @ApiOperation({ summary: 'Suspend a tenant' })
  suspend(@Param('id') id: string) {
    return this.tenantsService.suspend(id);
  }
}
