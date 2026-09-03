import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PicklistService } from './picklist.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { RequirePermission } from '../../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('settings/picklists')
export class PicklistController {
  constructor(private readonly service: PicklistService) {}

  @Get()
  @RequirePermission('settings:read')
  list(@CurrentUser() user: any, @Query('module') module?: string) {
    return this.service.list(user.tenantId, module);
  }

  @Get('modules')
  @RequirePermission('settings:read')
  modules(@CurrentUser() user: any) {
    return this.service.modules(user.tenantId);
  }

  // Consumed by module dropdowns; any authenticated user may read options.
  @Get('resolve/:key')
  @RequirePermission('settings:read')
  resolve(@CurrentUser() user: any, @Param('key') key: string) {
    return this.service.resolve(user.tenantId, key);
  }

  @Post()
  @RequirePermission('settings:manage')
  create(@CurrentUser() user: any, @Body() dto: any) {
    return this.service.createPicklist(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission('settings:manage')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.updatePicklist(user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermission('settings:manage')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.service.deletePicklist(user.tenantId, id);
  }

  @Post(':id/options')
  @RequirePermission('settings:manage')
  addOption(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.addOption(user.tenantId, id, dto);
  }

  @Post(':id/options/reorder')
  @RequirePermission('settings:manage')
  reorder(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: { orderedIds: string[] }) {
    return this.service.reorder(user.tenantId, id, dto.orderedIds ?? []);
  }

  @Patch('options/:optionId')
  @RequirePermission('settings:manage')
  updateOption(@CurrentUser() user: any, @Param('optionId') optionId: string, @Body() dto: any) {
    return this.service.updateOption(user.tenantId, optionId, dto);
  }

  @Delete('options/:optionId')
  @RequirePermission('settings:manage')
  deleteOption(@CurrentUser() user: any, @Param('optionId') optionId: string) {
    return this.service.deleteOption(user.tenantId, optionId);
  }
}
