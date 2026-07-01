import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ExtensibilityService } from './extensibility.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('extensibility')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('platform/extensibility')
export class ExtensibilityController {
  constructor(private readonly service: ExtensibilityService) {}

  // ─── Ph-289/290: objects ──────────────────────────────────────────
  @Get('objects')
  @RequirePermission('admin:read')
  listObjects(@CurrentUser() u: any) { return this.service.listObjects(u.tenantId); }

  @Post('objects')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Define a custom business object' })
  createObject(@CurrentUser() u: any, @Body() b: any) { return this.service.createObject(u.tenantId, b); }

  // ─── Ph-289/291: records + rules ──────────────────────────────────
  @Get('objects/:id/records')
  @RequirePermission('admin:read')
  listRecords(@CurrentUser() u: any, @Param('id') id: string) { return this.service.listRecords(u.tenantId, id); }

  @Post('objects/:id/records')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Create a record (validates fields + rules)' })
  createRecord(@CurrentUser() u: any, @Param('id') id: string, @Body() b: { data: any }) { return this.service.createRecord(u.tenantId, id, b.data ?? {}); }

  @Get('objects/:id/rules')
  @RequirePermission('admin:read')
  listRules(@CurrentUser() u: any, @Param('id') id: string) { return this.service.listRules(u.tenantId, id); }

  @Post('objects/:id/rules')
  @RequirePermission('admin:manage')
  addRule(@CurrentUser() u: any, @Param('id') id: string, @Body() b: any) { return this.service.addValidationRule(u.tenantId, id, b); }

  // ─── Ph-292: marketplace ──────────────────────────────────────────
  @Get('marketplace')
  @RequirePermission('admin:read')
  marketplace() { return this.service.marketplaceCatalog(); }

  @Post('marketplace/:key/install')
  @RequirePermission('admin:manage')
  @ApiOperation({ summary: 'Install a vertical marketplace pack' })
  install(@CurrentUser() u: any, @Param('key') key: string) { return this.service.installPack(u.tenantId, key); }
}
