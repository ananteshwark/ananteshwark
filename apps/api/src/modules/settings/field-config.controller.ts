import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { FieldConfigService } from './field-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateModuleFieldConfigDto } from './dto/field-config.dto';
import { FIELD_DEFAULTS } from './field-defaults';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('settings/field-config')
export class FieldConfigController {
  constructor(private readonly service: FieldConfigService) {}

  @Get()
  @RequirePermission('hr:org:manage')
  getAllModules(@CurrentUser() user: any) {
    return this.service.getAllModulesConfig(user.tenantId);
  }

  @Get('defaults')
  @RequirePermission('hr:org:manage')
  getDefaults() {
    return FIELD_DEFAULTS;
  }

  @Get(':module')
  @RequirePermission('hr:org:manage')
  getModule(@CurrentUser() user: any, @Param('module') module: string) {
    return this.service.getModuleConfig(user.tenantId, module);
  }

  @Patch(':module')
  @RequirePermission('hr:org:manage')
  updateModule(
    @CurrentUser() user: any,
    @Param('module') module: string,
    @Body() dto: UpdateModuleFieldConfigDto,
  ) {
    return this.service.updateModuleConfig(user.tenantId, module, dto.configs);
  }
}
