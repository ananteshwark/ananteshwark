import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RbacService } from './rbac.service';
import { PermissionsService } from './permissions.service';
import { CreateRoleDto, UpdateRoleDto, AssignRoleDto } from './dto/rbac.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('rbac')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RbacGuard)
@Controller('rbac')
export class RbacController {
  constructor(
    private readonly rbacService: RbacService,
    private readonly permissionsService: PermissionsService,
  ) {}

  @Get('roles')
  @RequirePermission('rbac:roles:read')
  @ApiOperation({ summary: 'List all roles' })
  findAll(@CurrentUser() user: any) {
    return this.rbacService.findAll(user.tenantId);
  }

  @Get('permissions')
  @RequirePermission('rbac:roles:read')
  @ApiOperation({ summary: 'Get all available permissions grouped by module' })
  getPermissions() {
    return this.permissionsService.getAllPermissions();
  }

  @Post('roles')
  @RequirePermission('rbac:roles:manage')
  @ApiOperation({ summary: 'Create a new role' })
  create(@CurrentUser() user: any, @Body() dto: CreateRoleDto) {
    return this.rbacService.createRole(user.tenantId, dto);
  }

  @Get('roles/:id')
  @RequirePermission('rbac:roles:read')
  @ApiOperation({ summary: 'Get role by ID' })
  findById(@Param('id') id: string) {
    return this.rbacService.findById(id);
  }

  @Patch('roles/:id')
  @RequirePermission('rbac:roles:manage')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rbacService.update(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermission('rbac:roles:manage')
  @ApiOperation({ summary: 'Delete a role' })
  delete(@Param('id') id: string) {
    return this.rbacService.delete(id);
  }

  @Get('users/:userId/permissions')
  @RequirePermission('rbac:roles:read')
  @ApiOperation({ summary: 'Get user permissions' })
  getUserPermissions(@CurrentUser() user: any, @Param('userId') userId: string) {
    return this.permissionsService.getUserPermissions(userId, user.tenantId);
  }

  @Post('users/:userId/roles')
  @RequirePermission('rbac:roles:manage')
  @ApiOperation({ summary: 'Assign role to user' })
  assignRole(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.permissionsService.assignRole(userId, dto.roleId, user.tenantId, user.id);
  }

  @Delete('users/:userId/roles/:roleId')
  @RequirePermission('rbac:roles:manage')
  @ApiOperation({ summary: 'Revoke role from user' })
  revokeRole(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Param('roleId') roleId: string,
  ) {
    return this.permissionsService.revokeRole(userId, roleId, user.tenantId);
  }
}
