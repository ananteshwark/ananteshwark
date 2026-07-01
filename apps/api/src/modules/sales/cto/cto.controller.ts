import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CtoService } from './cto.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('sales')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('sales/cto')
export class CtoController {
  constructor(private readonly service: CtoService) {}

  @Get('mappings')
  @RequirePermission('sales:read')
  listMappings(@CurrentUser() user: any, @Query('modelCode') modelCode?: string) {
    return this.service.listMappings(user.tenantId, modelCode);
  }

  @Post('mappings')
  @RequirePermission('sales:manage')
  createMapping(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createMapping(user.tenantId, dto);
  }

  @Delete('mappings/:id')
  @RequirePermission('sales:manage')
  deleteMapping(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deleteMapping(user.tenantId, id);
  }

  @Post('explode')
  @RequirePermission('sales:read')
  explode(@CurrentUser() user: any, @Body() dto: { modelCode: string; selectedOptions?: string[] }) {
    return this.service.explode(user.tenantId, dto.modelCode, dto.selectedOptions ?? []);
  }

  @Get('configurations')
  @RequirePermission('sales:read')
  listConfigurations(@CurrentUser() user: any) {
    return this.service.listConfigurations(user.tenantId);
  }

  @Get('configurations/:id')
  @RequirePermission('sales:read')
  getConfiguration(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.getConfiguration(user.tenantId, id);
  }

  @Post('configurations')
  @RequirePermission('sales:manage')
  createConfiguration(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createConfiguration(user.tenantId, dto);
  }

  @Post('configurations/:id/release')
  @RequirePermission('sales:manage')
  release(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.release(user.tenantId, id);
  }

  @Post('configurations/:id/cancel')
  @RequirePermission('sales:manage')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.cancel(user.tenantId, id);
  }
}
