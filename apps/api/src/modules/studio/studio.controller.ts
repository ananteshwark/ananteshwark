import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StudioService } from './studio.service';

@ApiTags('studio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('studio')
export class StudioController {
  constructor(private readonly service: StudioService) {}

  // ---- API keys ----
  @Get('api-keys')
  @RequirePermission('studio:apikeys:manage')
  listKeys(@CurrentUser() user: any) {
    return this.service.listKeys(user.tenantId);
  }

  @Post('api-keys')
  @RequirePermission('studio:apikeys:manage')
  @ApiOperation({ summary: 'Mint an API key (plaintext returned once)' })
  createKey(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createKey(user.tenantId, { ...dto, createdByUserId: user.id });
  }

  @Patch('api-keys/:id/scopes')
  @RequirePermission('studio:apikeys:manage')
  setScopes(@CurrentUser() user: any, @Param('id') id: string, @Body() body: { scopes: string[] }) {
    return this.service.setScopes(user.tenantId, id, body?.scopes ?? []);
  }

  @Post('api-keys/:id/revoke')
  @RequirePermission('studio:apikeys:manage')
  revokeKey(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.revokeKey(user.tenantId, id);
  }

  // ---- Lookup tables ----
  @Get('lookup-tables')
  @RequirePermission('studio:lookup:read')
  listTables(@CurrentUser() user: any) {
    return this.service.listTables(user.tenantId);
  }

  @Post('lookup-tables')
  @RequirePermission('studio:lookup:manage')
  createTable(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createTable(user.tenantId, dto);
  }

  @Get('lookup-tables/:key')
  @RequirePermission('studio:lookup:read')
  getTable(@CurrentUser() user: any, @Param('key') key: string) {
    return this.service.getTable(user.tenantId, key);
  }

  @Get('lookup-tables/:key/rows')
  @RequirePermission('studio:lookup:read')
  listRows(@CurrentUser() user: any, @Param('key') key: string) {
    return this.service.listRows(user.tenantId, key);
  }

  @Post('lookup-tables/:key/rows')
  @RequirePermission('studio:lookup:manage')
  @ApiOperation({ summary: 'Upsert a lookup row (keyed by the first column)' })
  upsertRow(@CurrentUser() user: any, @Param('key') key: string, @Body() body: { values: Record<string, any> }) {
    return this.service.upsertRow(user.tenantId, key, body?.values ?? {});
  }

  @Get('lookup-tables/:key/resolve')
  @RequirePermission('studio:lookup:read')
  @ApiOperation({ summary: 'Resolve a single lookup value by key' })
  resolve(@CurrentUser() user: any, @Param('key') key: string, @Query('lookupKey') lookupKey: string) {
    return this.service.lookup(user.tenantId, key, lookupKey);
  }

  @Delete('lookup-tables/:key/rows/:lookupKey')
  @RequirePermission('studio:lookup:manage')
  deleteRow(@CurrentUser() user: any, @Param('key') key: string, @Param('lookupKey') lookupKey: string) {
    return this.service.deleteRow(user.tenantId, key, lookupKey);
  }
}
